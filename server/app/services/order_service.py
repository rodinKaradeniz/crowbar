import secrets
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.menu import MenuItem
from app.models.order import Order, OrderLineItem, OrderStatusTimeline
from app.schemas.order import OrderPlaceRequest, OrderStatusUpdateRequest
from app.services import happy_hour_service

# Valid status transitions
_TRANSITIONS: dict[str, list[str]] = {
    "received": ["preparing", "cancelled"],
    "preparing": ["ready", "cancelled"],
    "ready": ["served", "cancelled"],
    "served": [],
    "cancelled": [],
}


def order_contains_alcohol(items) -> bool:
    """Single source of truth for 'this order contains alcohol'.

    Accepts any sequence of objects carrying an ``is_alcoholic`` attribute —
    resolved ``MenuItem`` rows on the placement path, or stored ``OrderLineItem``
    rows on the read path (line items snapshot the flag at placement, like
    ``routing_tag``). The order-level fact is derived from the items on demand and
    never persisted as a redundant column (same pattern as the happy-hour check).
    """
    return any(getattr(i, "is_alcoholic", False) for i in items)


class AgeConfirmationRequired(ValueError):
    """Raised at placement when an alcoholic cart lacks a valid age attestation."""


async def _load_order(db: AsyncSession, order_id: UUID, business_id: UUID) -> Order | None:
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.business_id == business_id)
        .options(
            selectinload(Order.line_items),
            selectinload(Order.status_timeline),
        )
    )
    return result.scalar_one_or_none()


def order_to_dict(order: Order) -> dict:
    return {
        "id": str(order.id),
        "business_id": str(order.business_id),
        "location_id": str(order.location_id) if order.location_id else None,
        "session_token": order.session_token,
        "table_identifier": order.table_identifier,
        "status": order.status,
        "idempotency_key": order.idempotency_key,
        "total_amount": float(order.total_amount),
        "notes": order.notes,
        "placed_at": order.placed_at.isoformat() if order.placed_at else None,
        "line_items": [
            {
                "id": str(li.id),
                "order_id": str(li.order_id),
                "item_id": str(li.item_id) if li.item_id else None,
                "item_name": li.item_name,
                "quantity": li.quantity,
                "unit_price": float(li.unit_price),
                "selected_modifiers": li.selected_modifiers or [],
                "routing_tag": li.routing_tag,
                "is_alcoholic": li.is_alcoholic,
                "notes": li.notes,
            }
            for li in (order.line_items or [])
        ],
    }


async def place_order(
    db: AsyncSession,
    business_id: UUID,
    request: OrderPlaceRequest,
    *,
    require_age_confirmation: bool = True,
) -> Order:
    """Create an order. Idempotent: returns existing order if same idempotency_key.

    ``require_age_confirmation`` gates the alcohol self-attestation. It is True on
    customer self-service channels (the public order endpoint) and False for
    staff-entered orders (the tabs path) — a staff member taking an order in
    person doesn't need a software checkbox. When True and the cart contains an
    alcoholic item, a truthy ``request.age_confirmed`` is required or
    ``AgeConfirmationRequired`` is raised (mapped to 422 by the router).
    """
    # Idempotency check
    existing = await db.execute(
        select(Order)
        .where(Order.idempotency_key == request.idempotency_key)
        .options(selectinload(Order.line_items), selectinload(Order.status_timeline))
    )
    existing_order = existing.scalar_one_or_none()
    if existing_order is not None:
        return existing_order

    # Resolve the requested menu items up front so the alcohol/age gate can run
    # before any rows are written.
    resolved: list[tuple[object, MenuItem]] = []
    for item_req in request.items:
        item_result = await db.execute(
            select(MenuItem).where(
                MenuItem.id == item_req.item_id,
                MenuItem.business_id == business_id,
            )
        )
        item = item_result.scalar_one_or_none()
        if item is None:
            continue
        resolved.append((item_req, item))

    # Age attestation gate (customer self-service channels only). Derived from the
    # resolved items via the single source of truth, then re-validated here so the
    # backend never trusts a client-only "box checked" state.
    if (
        require_age_confirmation
        and not request.age_confirmed
        and order_contains_alcohol(item for _, item in resolved)
    ):
        raise AgeConfirmationRequired(
            "Age confirmation is required for orders containing alcohol."
        )

    session_token = secrets.token_urlsafe(32)
    total = Decimal("0.00")

    # Determine happy-hour state once, server-side, at the moment the order is
    # placed. This uses the SAME is_happy_hour_active as the public menu read
    # path, so the price charged can never disagree with what was displayed.
    hh_active = await happy_hour_service.is_happy_hour_active(db, business_id)

    order = Order(
        business_id=business_id,
        session_token=session_token,
        table_identifier=request.table_identifier,
        status="received",
        idempotency_key=request.idempotency_key,
        notes=request.notes,
        age_confirmed=request.age_confirmed,
        total_amount=Decimal("0.00"),
    )
    db.add(order)
    await db.flush()

    for item_req, item in resolved:
        # Apply the flat happy-hour override when a window is active and the item
        # opts in (happy_hour_price set). Modifiers are added on top as usual.
        if hh_active and item.happy_hour_price is not None:
            unit_price = item.happy_hour_price
        else:
            unit_price = item.price
        selected_mods = []
        for mod_req in item_req.selected_modifiers:
            unit_price += mod_req.price_delta
            selected_mods.append({
                "modifier_id": mod_req.modifier_id,
                "name": mod_req.name,
                "price_delta": float(mod_req.price_delta),
            })

        line_total = unit_price * item_req.quantity
        total += line_total

        li = OrderLineItem(
            order_id=order.id,
            item_id=item.id,
            item_name=item.name,
            quantity=item_req.quantity,
            unit_price=unit_price,
            selected_modifiers=selected_mods,
            routing_tag=item.routing_tag,
            is_alcoholic=item.is_alcoholic,
            notes=item_req.notes,
        )
        db.add(li)

    order.total_amount = total
    db.add(
        OrderStatusTimeline(
            order_id=order.id,
            status="received",
        )
    )
    await db.flush()
    await db.refresh(order, ["line_items", "status_timeline"])
    return order


async def get_orders_for_board(
    db: AsyncSession,
    business_id: UUID,
    status_filter: list[str] | None = None,
    routing_tag: str | None = None,
) -> list[Order]:
    active_statuses = status_filter or ["received", "preparing", "ready"]
    q = (
        select(Order)
        .where(
            Order.business_id == business_id,
            Order.status.in_(active_statuses),
        )
        .options(selectinload(Order.line_items), selectinload(Order.status_timeline))
        .order_by(Order.placed_at)
    )
    result = await db.execute(q)
    orders = list(result.scalars().unique().all())

    if routing_tag:
        # Filter to orders that have at least one line item matching the routing_tag
        orders = [
            o for o in orders
            if any(li.routing_tag == routing_tag or li.routing_tag == "any" for li in o.line_items)
        ]

    return orders


async def advance_order_status(
    db: AsyncSession,
    order_id: UUID,
    business_id: UUID,
    request: OrderStatusUpdateRequest,
    changed_by: UUID | None = None,
) -> Order | None:
    order = await _load_order(db, order_id, business_id)
    if order is None:
        return None

    allowed = _TRANSITIONS.get(order.status, [])
    if request.status not in allowed:
        raise ValueError(
            f"Cannot transition from '{order.status}' to '{request.status}'. "
            f"Allowed: {allowed}"
        )

    order.status = request.status
    db.add(
        OrderStatusTimeline(
            order_id=order.id,
            status=request.status,
            changed_by=changed_by,
            changed_at=datetime.now(timezone.utc),
        )
    )
    await db.flush()
    await db.refresh(order, ["line_items", "status_timeline"])
    return order


async def get_order_by_session(
    db: AsyncSession, business_id: UUID, session_token: str
) -> list[Order]:
    """Return all orders for a customer session (most recent first)."""
    result = await db.execute(
        select(Order)
        .where(
            Order.business_id == business_id,
            Order.session_token == session_token,
        )
        .options(selectinload(Order.line_items), selectinload(Order.status_timeline))
        .order_by(Order.placed_at.desc())
    )
    return list(result.scalars().unique().all())
