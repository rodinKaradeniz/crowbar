import asyncio
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.business import Business
from app.models.menu import Menu, MenuCategory, MenuItem, Modifier, ModifierGroup
from app.models.order import Order
from app.schemas.order import OrderPlaceRequest
from app.services import order_service


async def _menu_context(
    db: AsyncSession, suffix: str
) -> tuple[Business, MenuItem, Modifier]:
    business = Business(
        name=f"Order {suffix}",
        slug=f"order-{suffix}",
        email=f"order-{suffix}@example.com",
        phone="+4915112345678",
        enabled_modules=["ordering"],
    )
    db.add(business)
    await db.flush()
    menu = Menu(business_id=business.id, name="Live", is_active=True)
    db.add(menu)
    await db.flush()
    category = MenuCategory(
        menu_id=menu.id,
        business_id=business.id,
        name="Drinks",
        is_active=True,
    )
    db.add(category)
    await db.flush()
    item = MenuItem(
        category_id=category.id,
        business_id=business.id,
        name="House Soda",
        price=Decimal("10.00"),
        is_available=True,
        routing_tag="bar",
    )
    db.add(item)
    await db.flush()
    group = ModifierGroup(
        item_id=item.id,
        business_id=business.id,
        name="Size",
        required=True,
        min_select=1,
        max_select=1,
    )
    db.add(group)
    await db.flush()
    modifier = Modifier(
        group_id=group.id,
        business_id=business.id,
        name="Large",
        price_delta=Decimal("2.00"),
        is_available=True,
    )
    db.add(modifier)
    await db.flush()
    return business, item, modifier


def _request(item: MenuItem, modifier: Modifier, *, key: str, quantity: int = 2):
    return OrderPlaceRequest.model_validate(
        {
            "items": [
                {
                    "item_id": item.id,
                    "quantity": quantity,
                    "selected_modifiers": [
                        {
                            "modifier_id": modifier.id,
                            "name": "Tampered name",
                            "price_delta": -999,
                        }
                    ],
                }
            ],
            "idempotency_key": key,
        }
    )


@pytest.mark.asyncio
async def test_order_uses_authoritative_item_and_modifier_snapshots(
    db_session: AsyncSession,
):
    business, item, modifier = await _menu_context(db_session, "authority")

    order, created = await order_service.place_order(
        db_session,
        business.id,
        _request(item, modifier, key="authority-key"),
        require_age_confirmation=False,
        channel="staff",
    )

    assert created is True
    assert order.total_amount == Decimal("24.00")
    assert order.line_items[0].item_name == "House Soda"
    assert order.line_items[0].unit_price == Decimal("12.00")
    assert order.line_items[0].selected_modifiers == [
        {
            "modifier_id": str(modifier.id),
            "name": "Large",
            "price_delta": 2.0,
        }
    ]


@pytest.mark.asyncio
async def test_invalid_cart_is_rejected_without_partial_order(
    db_session: AsyncSession,
):
    business, item, modifier = await _menu_context(db_session, "atomic")
    request = _request(item, modifier, key="atomic-key")
    request.items[0].item_id = business.id

    with pytest.raises(order_service.OrderValidationError, match="unavailable"):
        await order_service.place_order(
            db_session,
            business.id,
            request,
            require_age_confirmation=False,
            channel="staff",
        )

    assert await db_session.scalar(select(func.count(Order.id))) == 0


@pytest.mark.asyncio
async def test_required_and_unavailable_modifiers_are_enforced(
    db_session: AsyncSession,
):
    business, item, modifier = await _menu_context(db_session, "modifiers")
    missing = OrderPlaceRequest(
        items=[{"item_id": item.id}],
        idempotency_key="missing-required",
    )
    with pytest.raises(order_service.OrderValidationError, match="Select between"):
        await order_service.place_order(
            db_session,
            business.id,
            missing,
            require_age_confirmation=False,
            channel="staff",
        )

    modifier.is_available = False
    await db_session.flush()
    with pytest.raises(order_service.OrderValidationError, match="unavailable"):
        await order_service.place_order(
            db_session,
            business.id,
            _request(item, modifier, key="unavailable-modifier"),
            require_age_confirmation=False,
            channel="staff",
        )


@pytest.mark.asyncio
async def test_idempotency_is_business_scoped_and_fingerprint_bound(
    db_session: AsyncSession,
):
    first_business, first_item, first_modifier = await _menu_context(
        db_session, "idem-one"
    )
    request = _request(first_item, first_modifier, key="shared-key")
    first, created = await order_service.place_order(
        db_session,
        first_business.id,
        request,
        require_age_confirmation=False,
        channel="staff",
    )
    replay, replay_created = await order_service.place_order(
        db_session,
        first_business.id,
        request,
        require_age_confirmation=False,
        channel="staff",
    )
    assert replay.id == first.id
    assert created is True
    assert replay_created is False

    changed = _request(
        first_item, first_modifier, key="shared-key", quantity=3
    )
    with pytest.raises(order_service.OrderIdempotencyConflict):
        await order_service.place_order(
            db_session,
            first_business.id,
            changed,
            require_age_confirmation=False,
            channel="staff",
        )

    second_business, second_item, second_modifier = await _menu_context(
        db_session, "idem-two"
    )
    second, second_created = await order_service.place_order(
        db_session,
        second_business.id,
        _request(second_item, second_modifier, key="shared-key"),
        require_age_confirmation=False,
        channel="staff",
    )
    assert second_created is True
    assert second.business_id == second_business.id
    assert second.id != first.id


@pytest.mark.asyncio
@pytest.mark.parametrize("channel", ["public_qr", "staff_tab"])
async def test_concurrent_order_retry_creates_one_order(
    db_session: AsyncSession,
    channel: str,
):
    business, item, modifier = await _menu_context(db_session, f"concurrent-{channel}")
    business_id = business.id
    request = _request(item, modifier, key=f"concurrent-{channel}-key")
    await db_session.commit()
    session_factory = async_sessionmaker(
        db_session.bind, class_=AsyncSession, expire_on_commit=False
    )

    async def submit() -> tuple[str, bool]:
        async with session_factory() as session:
            order, created = await order_service.place_order(
                session,
                business_id,
                request,
                require_age_confirmation=channel == "public_qr",
                channel=channel,
            )
            result = (str(order.id), created)
            await session.commit()
            return result

    results = await asyncio.gather(submit(), submit())

    assert results[0][0] == results[1][0]
    assert sorted(created for _, created in results) == [False, True]
