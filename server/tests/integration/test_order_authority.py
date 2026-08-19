import asyncio
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.business import Business
from app.models.inventory import InventoryItem, StockMovement
from app.models.menu import Menu, MenuCategory, MenuItem, Modifier, ModifierGroup
from app.models.order import Order, OrderRevision
from app.models.preparation_station import PreparationStation
from app.models.recipe import MenuItemIngredient
from app.models.tab import TabSettlementEvent
from app.models.user import User
from app.schemas.order import (
    OrderCancellationRequest,
    OrderCorrectionRequest,
    OrderLineStatusUpdateRequest,
    OrderPlaceRequest,
)
from app.schemas.tab import TabReopenRequest, TabSettleExternallyRequest
from app.schemas.tax import TaxProfileVersionCreate
from app.services import order_service, tab_service, tax_service


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
    tax_profiles = await tax_service.create_default_profiles(db, business)
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
        tax_profile_id=tax_profiles[0].id,
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
    assert order.currency_code == "EUR"
    assert order.subtotal_amount == Decimal("20.17")
    assert order.tax_amount == Decimal("3.83")
    assert order.line_items[0].item_name == "House Soda"
    assert order.line_items[0].unit_price == Decimal("12.00")
    assert order.line_items[0].selected_modifiers == [
        {
            "modifier_id": str(modifier.id),
            "name": "Large",
            "price_delta": 2.0,
        }
    ]
    assert order.line_items[0].tax_profile_code == "STANDARD"
    assert order.line_items[0].tax_profile_name == "Standard"
    assert order.line_items[0].tax_rate == Decimal("19")
    assert order.line_items[0].price_includes_tax is True


@pytest.mark.asyncio
async def test_tax_profile_changes_only_affect_later_orders(db_session: AsyncSession):
    business, item, modifier = await _menu_context(db_session, "tax-version")
    original, _ = await order_service.place_order(
        db_session,
        business.id,
        _request(item, modifier, key="old-tax", quantity=1),
        require_age_confirmation=False,
        channel="staff",
    )
    profile_id = original.line_items[0].tax_profile_id

    await tax_service.add_version(
        db_session,
        business.id,
        profile_id,
        None,  # System-created test version; created_by is intentionally nullable.
        TaxProfileVersionCreate(
            name="Scheduled operational rate",
            rate=Decimal("7"),
            price_includes_tax=False,
            effective_from=datetime.now(timezone.utc),
        ),
    )
    later, _ = await order_service.place_order(
        db_session,
        business.id,
        _request(item, modifier, key="new-tax", quantity=1),
        require_age_confirmation=False,
        channel="staff",
    )

    assert original.line_items[0].tax_profile_name == "Standard"
    assert original.line_items[0].tax_rate == Decimal("19")
    assert original.line_items[0].total_amount == Decimal("12.00")
    assert later.line_items[0].tax_profile_name == "Scheduled operational rate"
    assert later.line_items[0].tax_rate == Decimal("7")
    assert later.line_items[0].subtotal_amount == Decimal("12.00")
    assert later.line_items[0].tax_amount == Decimal("0.84")
    assert later.line_items[0].total_amount == Decimal("12.84")


@pytest.mark.asyncio
async def test_order_totals_mixed_inclusive_and_exclusive_profiles(
    db_session: AsyncSession,
):
    business, first_item, modifier = await _menu_context(db_session, "mixed-tax")
    profiles = await tax_service.list_profiles(db_session, business.id)
    reduced = next(profile for profile in profiles if profile.code == "REDUCED")
    await tax_service.add_version(
        db_session,
        business.id,
        reduced.id,
        None,
        TaxProfileVersionCreate(
            name="Reduced exclusive",
            rate=Decimal("7"),
            price_includes_tax=False,
            effective_from=datetime.now(timezone.utc),
        ),
    )
    second_item = MenuItem(
        category_id=first_item.category_id,
        business_id=business.id,
        tax_profile_id=reduced.id,
        name="Snack",
        price=Decimal("10.00"),
        is_available=True,
        routing_tag="kitchen",
    )
    db_session.add(second_item)
    await db_session.flush()
    request = OrderPlaceRequest.model_validate(
        {
            "items": [
                {
                    "item_id": first_item.id,
                    "quantity": 1,
                    "selected_modifiers": [{"modifier_id": modifier.id}],
                },
                {"item_id": second_item.id, "quantity": 1},
            ],
            "idempotency_key": "mixed-tax-key",
        }
    )

    order, _ = await order_service.place_order(
        db_session,
        business.id,
        request,
        require_age_confirmation=False,
        channel="staff",
    )

    assert order.subtotal_amount == Decimal("20.08")
    assert order.tax_amount == Decimal("2.62")
    assert order.total_amount == Decimal("22.70")
    assert {line.price_includes_tax for line in order.line_items} == {True, False}


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
async def test_station_snapshot_line_transition_and_correction_boundary(
    db_session: AsyncSession,
):
    business, item, modifier = await _menu_context(db_session, "station-lines")
    actor = User(
        email="station-lines@example.com",
        name="Station Manager",
        password_hash="test-only",
        user_type="staff",
    )
    station = PreparationStation(
        business_id=business.id,
        name="Cold Bar",
        sort_order=30,
        is_active=True,
    )
    db_session.add_all([actor, station])
    await db_session.flush()
    item.preparation_station_id = station.id
    item.routes_to_all_stations = False

    order, _ = await order_service.place_order(
        db_session,
        business.id,
        _request(item, modifier, key="station-line-order", quantity=1),
        require_age_confirmation=False,
        channel="staff",
    )
    line = order.line_items[0]
    assert line.preparation_station_id == station.id
    assert line.preparation_station_name == "Cold Bar"
    assert line.routes_to_all_stations is False
    assert line.line_status == "received"

    transitioned = await order_service.advance_order_line_status(
        db_session,
        business_id=business.id,
        order_id=order.id,
        line_id=line.id,
        request=OrderLineStatusUpdateRequest(status="preparing"),
        changed_by=actor.id,
    )
    assert transitioned is not None
    assert transitioned.status == "preparing"
    assert transitioned.line_items[0].line_status == "preparing"

    before_total = transitioned.total_amount
    with pytest.raises(order_service.OrderValidationError, match="before preparation"):
        await order_service.correct_order(
            db_session,
            business_id=business.id,
            order_id=order.id,
            request=OrderCorrectionRequest(
                items=_request(item, modifier, key="unused", quantity=2).items,
                reason="Guest requested a larger round",
                idempotency_key="correction-after-prep",
            ),
            actor_id=actor.id,
        )
    assert transitioned.total_amount == before_total
    assert await db_session.scalar(select(func.count(OrderRevision.id))) == 0


@pytest.mark.asyncio
async def test_line_serving_and_previous_step_correction_have_exact_linked_inventory(
    db_session: AsyncSession,
):
    business, item, modifier = await _menu_context(db_session, "line-ledger")
    actor = User(
        email="line-ledger@example.com",
        name="Line Ledger Manager",
        password_hash="test-only",
        user_type="staff",
    )
    inventory = InventoryItem(
        business_id=business.id,
        name="Soda syrup",
        unit="each",
        unit_type="each",
        current_quantity=Decimal("10"),
        is_active=True,
    )
    db_session.add_all([actor, inventory])
    await db_session.flush()
    db_session.add(MenuItemIngredient(
        menu_item_id=item.id,
        inventory_item_id=inventory.id,
        quantity=Decimal("2"),
    ))
    await db_session.flush()
    order, _ = await order_service.place_order(
        db_session,
        business.id,
        _request(item, modifier, key="line-ledger-order", quantity=3),
        require_age_confirmation=False,
        channel="staff",
    )
    line_id = order.line_items[0].id

    for status in ("preparing", "ready", "served"):
        order = await order_service.advance_order_line_status(
            db_session,
            business_id=business.id,
            order_id=order.id,
            line_id=line_id,
            request=OrderLineStatusUpdateRequest(status=status),
            changed_by=actor.id,
        )
        assert order is not None
    await db_session.refresh(inventory)
    assert inventory.current_quantity == Decimal("4")
    sale = await db_session.scalar(select(StockMovement).where(
        StockMovement.order_line_item_id == line_id,
        StockMovement.movement_type == "sale",
    ))
    assert sale is not None and sale.quantity_delta == Decimal("-6")

    order = await order_service.advance_order_line_status(
        db_session,
        business_id=business.id,
        order_id=order.id,
        line_id=line_id,
        request=OrderLineStatusUpdateRequest(status="ready"),
        changed_by=actor.id,
    )
    await db_session.refresh(inventory)
    assert order is not None and order.status == "ready"
    assert inventory.current_quantity == Decimal("10")
    reversal = await db_session.scalar(select(StockMovement).where(
        StockMovement.order_line_item_id == line_id,
        StockMovement.movement_type == "sale_reversal",
    ))
    assert reversal is not None and reversal.quantity_delta == Decimal("6")


@pytest.mark.asyncio
async def test_external_settlement_is_idempotent_freezes_total_and_blocks_economic_mutation(
    db_session: AsyncSession,
):
    business, item, modifier = await _menu_context(db_session, "settlement")
    actor = User(
        email="settlement-manager@example.com",
        name="Settlement Manager",
        password_hash="test-only",
        user_type="staff",
    )
    db_session.add(actor)
    await db_session.flush()
    tab = await tab_service.open_tab(db_session, business.id, actor.id)
    order, _ = await order_service.place_order(
        db_session,
        business.id,
        _request(item, modifier, key="settlement-order", quantity=1),
        require_age_confirmation=False,
        tab_id=tab.id,
        channel="staff",
    )

    command = TabSettleExternallyRequest(
        idempotency_key="settlement-command-1",
        informational_method="card",
        note="Recorded from the external register",
        external_register_reference="REGISTER-42",
    )
    settled, changed = await tab_service.settle_externally(
        db_session,
        business_id=business.id,
        tab_id=tab.id,
        actor_id=actor.id,
        request=command,
    )
    retried, retry_changed = await tab_service.settle_externally(
        db_session,
        business_id=business.id,
        tab_id=tab.id,
        actor_id=actor.id,
        request=command,
    )
    assert settled is not None and retried is not None
    assert changed is True and retry_changed is False
    assert settled.status == "settled_externally"
    event = await db_session.get(TabSettlementEvent, settled.current_settlement_event_id)
    assert event is not None
    assert event.total_snapshot == order.total_amount
    assert event.informational_method == "card"
    assert event.external_register_reference == "REGISTER-42"
    assert await db_session.scalar(select(func.count(TabSettlementEvent.id))) == 1

    with pytest.raises(order_service.OrderValidationError, match="external settlement"):
        await order_service.cancel_order(
            db_session,
            business_id=business.id,
            order_id=order.id,
            request=OrderCancellationRequest(
                reason="Incorrect round",
                idempotency_key="cancel-after-settlement",
            ),
            actor_id=actor.id,
        )

    reopened, reopened_changed = await tab_service.reopen_tab(
        db_session,
        business_id=business.id,
        tab_id=tab.id,
        actor_id=actor.id,
        request=TabReopenRequest(
            idempotency_key="reopen-command-1",
            reason="External register entry was voided",
        ),
    )
    assert reopened is not None and reopened.status == "open"
    assert reopened_changed is True
    events = list((await db_session.scalars(select(TabSettlementEvent))).all())
    assert [entry.event_type for entry in events] == ["settled_externally", "reopened"]
    assert events[1].related_settlement_event_id == events[0].id


@pytest.mark.asyncio
async def test_settlement_and_order_addition_share_one_tab_lock(
    db_session: AsyncSession,
):
    business, item, modifier = await _menu_context(db_session, "settlement-race")
    actor = User(
        email="settlement-race@example.com",
        name="Settlement Race Manager",
        password_hash="test-only",
        user_type="staff",
    )
    db_session.add(actor)
    await db_session.flush()
    tab = await tab_service.open_tab(db_session, business.id, actor.id)
    await db_session.commit()

    sessions = async_sessionmaker(
        bind=db_session.bind, class_=AsyncSession, expire_on_commit=False
    )

    async def add_order():
        async with sessions() as session:
            try:
                await tab_service.add_order_to_tab(
                    session,
                    business.id,
                    tab.id,
                    _request(item, modifier, key="settlement-race-order", quantity=1),
                )
                await session.commit()
                return "order_added"
            except ValueError:
                await session.rollback()
                return "order_blocked"

    async def settle():
        async with sessions() as session:
            await tab_service.settle_externally(
                session,
                business_id=business.id,
                tab_id=tab.id,
                actor_id=actor.id,
                request=TabSettleExternallyRequest(
                    idempotency_key="settlement-race-command",
                ),
            )
            await session.commit()
            return "settled"

    outcomes = await asyncio.gather(add_order(), settle())
    assert "settled" in outcomes

    async with sessions() as session:
        orders = await tab_service.get_tab_orders(session, tab.id)
        events = await tab_service.get_settlement_events(session, business.id, tab.id)
        assert len(events) == 1
        assert len(orders) in {0, 1}
        expected = Decimal("0") if not orders else orders[0].total_amount
        assert events[0].total_snapshot == expected
        assert ("order_added" in outcomes) is bool(orders)


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
