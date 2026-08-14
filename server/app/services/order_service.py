import hashlib
import json
import logging
import secrets
from datetime import datetime, time, timezone
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfoNotFoundError

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business import Business
from app.models.menu import Menu, MenuCategory, MenuItem, Modifier, ModifierGroup
from app.models.order import Order, OrderLineItem, OrderStatusTimeline
from app.models.table import Table
from app.schemas.order import OrderPlaceRequest, OrderStatusUpdateRequest
from app.services import happy_hour_service, recipe_service, tax_service
from app.services.floor_plan_service import resolve_service_window

logger = logging.getLogger(__name__)

# Valid status transitions. Forward advances the fulfillment flow; the backward
# entries (previous-step only) let staff correct an accidental click. Moving
# backward out of 'served' reverses the recipe deduction (see advance_order_status);
# every other backward step has no inventory side effect. 'cancelled' is a terminal
# side-exit (no un-cancel in this pass).
_TRANSITIONS: dict[str, list[str]] = {
    "received": ["preparing", "cancelled"],
    "preparing": ["received", "ready", "cancelled"],
    "ready": ["preparing", "served", "cancelled"],
    "served": ["ready"],
    "cancelled": [],
}

# How many served orders the default board query surfaces in the 'served' column
# (terminal + accumulates forever, so it's bounded to today, newest first).
_SERVED_BOARD_LIMIT = 50


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


class OrderValidationError(ValueError):
    """The submitted cart references unavailable or incompatible menu data."""


class OrderIdempotencyConflict(ValueError):
    """An idempotency key was reused for a different order request."""


def _request_fingerprint(
    request: OrderPlaceRequest,
    *,
    table_id: UUID | None,
    tab_id: UUID | None,
    channel: str | None,
) -> str:
    payload = {
        "table_id": str(table_id) if table_id else None,
        "tab_id": str(tab_id) if tab_id else None,
        "channel": channel,
        "notes": request.notes,
        "age_confirmed": request.age_confirmed,
        "items": [
            {
                "item_id": str(item.item_id),
                "quantity": item.quantity,
                "modifier_ids": sorted(
                    str(modifier.modifier_id)
                    for modifier in item.selected_modifiers
                ),
                "notes": item.notes,
            }
            for item in request.items
        ],
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def _load_idempotent_order(
    db: AsyncSession,
    *,
    business_id: UUID,
    idempotency_key: str,
    fingerprint: str,
) -> Order | None:
    result = await db.execute(
        select(Order)
        .where(
            Order.business_id == business_id,
            Order.idempotency_key == idempotency_key,
        )
        .options(
            selectinload(Order.line_items),
            selectinload(Order.status_timeline),
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None and existing.request_fingerprint != fingerprint:
        raise OrderIdempotencyConflict(
            "This idempotency key was already used for a different order"
        )
    return existing


async def _resolve_cart(
    db: AsyncSession,
    *,
    business_id: UUID,
    request: OrderPlaceRequest,
    location_id: UUID | None,
) -> list[tuple[object, MenuItem, list[Modifier]]]:
    requested_ids = {item.item_id for item in request.items}
    menu_location_filter = (
        Menu.location_id.is_(None)
        if location_id is None
        else or_(Menu.location_id.is_(None), Menu.location_id == location_id)
    )
    rows = await db.scalars(
        select(MenuItem)
        .join(MenuCategory, MenuCategory.id == MenuItem.category_id)
        .join(Menu, Menu.id == MenuCategory.menu_id)
        .where(
            MenuItem.id.in_(requested_ids),
            MenuItem.business_id == business_id,
            MenuItem.is_available.is_(True),
            MenuCategory.business_id == business_id,
            MenuCategory.is_active.is_(True),
            Menu.business_id == business_id,
            Menu.is_active.is_(True),
            menu_location_filter,
        )
        .options(
            selectinload(MenuItem.modifier_groups).selectinload(
                ModifierGroup.modifiers
            )
        )
    )
    items_by_id = {item.id: item for item in rows.unique().all()}
    if set(items_by_id) != requested_ids:
        raise OrderValidationError(
            "One or more menu items are unavailable for this table"
        )

    resolved = []
    for item_request in request.items:
        item = items_by_id[item_request.item_id]
        groups = {group.id: group for group in item.modifier_groups}
        available_modifiers = {
            modifier.id: (group, modifier)
            for group in groups.values()
            for modifier in group.modifiers
            if modifier.is_available
        }
        requested_modifier_ids = [
            modifier.modifier_id for modifier in item_request.selected_modifiers
        ]
        if len(requested_modifier_ids) != len(set(requested_modifier_ids)):
            raise OrderValidationError("A modifier cannot be selected more than once")
        if any(
            modifier_id not in available_modifiers
            for modifier_id in requested_modifier_ids
        ):
            raise OrderValidationError(
                f"A selected modifier is unavailable for {item.name}"
            )

        selected_by_group: dict[UUID, list[Modifier]] = {
            group_id: [] for group_id in groups
        }
        for modifier_id in requested_modifier_ids:
            group, modifier = available_modifiers[modifier_id]
            selected_by_group[group.id].append(modifier)
        for group in groups.values():
            selected_count = len(selected_by_group[group.id])
            minimum = max(group.min_select, 1 if group.required else 0)
            if selected_count < minimum or selected_count > group.max_select:
                raise OrderValidationError(
                    f"Select between {minimum} and {group.max_select} option(s) for {group.name}"
                )
        resolved.append(
            (
                item_request,
                item,
                [
                    available_modifiers[modifier_id][1]
                    for modifier_id in requested_modifier_ids
                ],
            )
        )
    return resolved


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
        "table_id": str(order.table_id) if order.table_id else None,
        "tab_id": str(order.tab_id) if order.tab_id else None,
        "session_token": order.session_token,
        "table_identifier": order.table_identifier,
        "status": order.status,
        "idempotency_key": order.idempotency_key,
        "currency_code": order.currency_code,
        "subtotal_amount": float(order.subtotal_amount),
        "tax_amount": float(order.tax_amount),
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
                "currency_code": li.currency_code,
                "tax_profile_id": str(li.tax_profile_id) if li.tax_profile_id else None,
                "tax_profile_version_id": str(li.tax_profile_version_id) if li.tax_profile_version_id else None,
                "tax_profile_name": li.tax_profile_name,
                "tax_profile_code": li.tax_profile_code,
                "tax_rate": float(li.tax_rate),
                "price_includes_tax": li.price_includes_tax,
                "subtotal_amount": float(li.subtotal_amount),
                "tax_amount": float(li.tax_amount),
                "total_amount": float(li.total_amount),
                "selected_modifiers": li.selected_modifiers or [],
                "routing_tag": li.routing_tag,
                "is_alcoholic": li.is_alcoholic,
                "notes": li.notes,
            }
            for li in (order.line_items or [])
        ],
        "status_timeline": [
            {
                "id": str(t.id),
                "from_status": t.from_status,
                "status": t.status,
                "changed_by": str(t.changed_by) if t.changed_by else None,
                "changed_at": t.changed_at.isoformat() if t.changed_at else None,
            }
            for t in sorted(
                order.status_timeline or [], key=lambda x: x.changed_at
            )
        ],
    }


async def place_order(
    db: AsyncSession,
    business_id: UUID,
    request: OrderPlaceRequest,
    *,
    require_age_confirmation: bool = True,
    table_id: UUID | None = None,
    tab_id: UUID | None = None,
    customer_id: UUID | None = None,
    channel: str | None = None,
    allow_legacy_table_identifier: bool = False,
) -> tuple[Order, bool]:
    """Create an order. Idempotent: returns existing order if same idempotency_key.

    ``require_age_confirmation`` gates the alcohol self-attestation. It is True on
    customer self-service channels (the public order endpoint) and False for
    staff-entered orders (the tabs path) — a staff member taking an order in
    person doesn't need a software checkbox. When True and the cart contains an
    alcoholic item, a truthy ``request.age_confirmed`` is required or
    ``AgeConfirmationRequired`` is raised (mapped to 422 by the router).
    """
    fingerprint = _request_fingerprint(
        request, table_id=table_id, tab_id=tab_id, channel=channel
    )
    existing_order = await _load_idempotent_order(
        db,
        business_id=business_id,
        idempotency_key=request.idempotency_key,
        fingerprint=fingerprint,
    )
    if existing_order is not None:
        return existing_order, False

    location_id = None
    if table_id is not None:
        location_id = await db.scalar(
            select(Table.location_id).where(
                Table.id == table_id,
                Table.business_id == business_id,
                Table.is_active.is_(True),
                Table.deleted_at.is_(None),
            )
        )
        if location_id is None:
            raise OrderValidationError("The order table is unavailable")
    resolved = await _resolve_cart(
        db,
        business_id=business_id,
        request=request,
        location_id=location_id,
    )

    # Age attestation gate (customer self-service channels only). Derived from the
    # resolved items via the single source of truth, then re-validated here so the
    # backend never trusts a client-only "box checked" state.
    if (
        require_age_confirmation
        and not request.age_confirmed
        and order_contains_alcohol(item for _, item, _ in resolved)
    ):
        raise AgeConfirmationRequired(
            "Age confirmation is required for orders containing alcohol."
        )

    session_token = secrets.token_urlsafe(32)
    placed_at = datetime.now(timezone.utc)
    business = await db.scalar(
        select(Business).where(Business.id == business_id).with_for_update()
    )
    if business is None:
        raise OrderValidationError("Business not found")
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    total = Decimal("0")

    # Determine happy-hour state once, server-side, at the moment the order is
    # placed. This uses the SAME is_happy_hour_active as the public menu read
    # path, so the price charged can never disagree with what was displayed.
    hh_active = await happy_hour_service.is_happy_hour_active(db, business_id)

    order = Order(
        business_id=business_id,
        location_id=location_id,
        session_token=session_token,
        table_id=table_id,
        tab_id=tab_id,
        customer_id=customer_id,
        channel=channel,
        table_identifier=(request.table_identifier if allow_legacy_table_identifier else None),
        status="received",
        idempotency_key=request.idempotency_key,
        request_fingerprint=fingerprint,
        notes=request.notes,
        age_confirmed=request.age_confirmed,
        currency_code=business.currency_code,
        subtotal_amount=Decimal("0"),
        tax_amount=Decimal("0"),
        total_amount=Decimal("0.00"),
    )
    try:
        async with db.begin_nested():
            db.add(order)
            await db.flush()
    except IntegrityError:
        existing_order = await _load_idempotent_order(
            db,
            business_id=business_id,
            idempotency_key=request.idempotency_key,
            fingerprint=fingerprint,
        )
        if existing_order is None:
            raise
        return existing_order, False

    for item_req, item, modifiers in resolved:
        # Apply the flat happy-hour override when a window is active and the item
        # opts in (happy_hour_price set). Modifiers are added on top as usual.
        if hh_active and item.happy_hour_price is not None:
            unit_price = item.happy_hour_price
        else:
            unit_price = item.price
        selected_mods = []
        for modifier in modifiers:
            unit_price += modifier.price_delta
            selected_mods.append({
                "modifier_id": str(modifier.id),
                "name": modifier.name,
                "price_delta": float(modifier.price_delta),
            })

        if unit_price < 0:
            raise OrderValidationError(f"The configured price for {item.name} is invalid")

        entered_line_total = unit_price * item_req.quantity
        try:
            tax_profile, tax_version = await tax_service.resolve_profile_version(
                db, business_id, item.tax_profile_id, placed_at
            )
        except tax_service.TaxProfileError as exc:
            raise OrderValidationError(f"{item.name}: {exc}") from exc
        line_subtotal, line_tax, line_total = tax_service.calculate_line_tax(
            entered_line_total,
            tax_version.rate,
            tax_version.price_includes_tax,
            business.currency_code,
        )
        subtotal += line_subtotal
        tax_total += line_tax
        total += line_total

        li = OrderLineItem(
            order_id=order.id,
            item_id=item.id,
            item_name=item.name,
            quantity=item_req.quantity,
            unit_price=unit_price,
            currency_code=business.currency_code,
            tax_profile_id=tax_profile.id,
            tax_profile_version_id=tax_version.id,
            tax_profile_name=tax_version.name,
            tax_profile_code=tax_profile.code,
            tax_rate=tax_version.rate,
            price_includes_tax=tax_version.price_includes_tax,
            subtotal_amount=line_subtotal,
            tax_amount=line_tax,
            total_amount=line_total,
            selected_modifiers=selected_mods,
            routing_tag=item.routing_tag,
            is_alcoholic=item.is_alcoholic,
            notes=item_req.notes,
        )
        db.add(li)

    order.subtotal_amount = subtotal
    order.tax_amount = tax_total
    order.total_amount = total
    db.add(
        OrderStatusTimeline(
            order_id=order.id,
            status="received",
        )
    )
    await db.flush()
    await db.refresh(order, ["line_items", "status_timeline"])
    return order, True


async def _business_day_start_utc(db: AsyncSession, business_id: UUID) -> datetime:
    """Start of 'today' in the business's timezone, expressed in UTC.

    Uses businesses.timezone (IANA); falls back to UTC on a missing/invalid zone
    (same defensive posture as happy_hour_service)."""
    business = await db.scalar(select(Business).where(Business.id == business_id))
    if business is None:
        return datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)
    try:
        return resolve_service_window(business)[1]
    except (ZoneInfoNotFoundError, ValueError):
        return datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)


async def get_orders_for_board(
    db: AsyncSession,
    business_id: UUID,
    status_filter: list[str] | None = None,
    routing_tag: str | None = None,
) -> list[Order]:
    opts = (selectinload(Order.line_items), selectinload(Order.status_timeline))

    if status_filter:
        # Explicit caller-provided filter: honor it literally (no served bound).
        q = (
            select(Order)
            .where(
                Order.business_id == business_id,
                Order.status.in_(status_filter),
            )
            .options(*opts)
            .order_by(Order.placed_at)
        )
        result = await db.execute(q)
        orders = list(result.scalars().unique().all())
    else:
        # Default board: all active tickets, plus today's served tickets (bounded)
        # so the 'served' column is useful for backward-correction without
        # growing without limit.
        active_q = (
            select(Order)
            .where(
                Order.business_id == business_id,
                Order.status.in_(["received", "preparing", "ready"]),
            )
            .options(*opts)
            .order_by(Order.placed_at)
        )
        active_result = await db.execute(active_q)
        orders = list(active_result.scalars().unique().all())

        day_start = await _business_day_start_utc(db, business_id)
        # Filter/sort by when the order actually ENTERED 'served' (the timeline
        # row's changed_at), NOT placed_at — an order placed late last night but
        # served this morning belongs in today's list; one served on a later day
        # must not linger. An order can enter 'served' more than once (un-serve →
        # re-serve, Non-Obvious #40), so key off the MOST RECENT →served row,
        # which is the current serve.
        served_at_subq = (
            select(
                OrderStatusTimeline.order_id.label("order_id"),
                func.max(OrderStatusTimeline.changed_at).label("served_at"),
            )
            .where(OrderStatusTimeline.status == "served")
            .group_by(OrderStatusTimeline.order_id)
            .subquery()
        )
        served_q = (
            select(Order)
            .join(served_at_subq, served_at_subq.c.order_id == Order.id)
            .where(
                Order.business_id == business_id,
                Order.status == "served",
                served_at_subq.c.served_at >= day_start,
            )
            .options(*opts)
            .order_by(served_at_subq.c.served_at.desc())
            .limit(_SERVED_BOARD_LIMIT)
        )
        served_result = await db.execute(served_q)
        orders.extend(served_result.scalars().unique().all())

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

    from_status = order.status
    order.status = request.status
    # Audit row: records from → to for every transition (forward or backward),
    # appended from this one handler (the audit log for the ticket board).
    db.add(
        OrderStatusTimeline(
            order_id=order.id,
            from_status=from_status,
            status=request.status,
            changed_by=changed_by,
            changed_at=datetime.now(timezone.utc),
        )
    )
    await db.flush()

    # Inventory side effects at the 'served' boundary only (consistent with how
    # deduction was originally scoped). Both are best-effort / non-blocking.
    if from_status != "served" and request.status == "served":
        # Forward into served: auto-deduct recipe ingredients from inventory.
        await recipe_service.deduct_for_served_order(db, order, business_id)
    elif from_status == "served" and request.status != "served":
        # Backward out of served: credit back exactly what this order deducted.
        await recipe_service.reverse_deduction_for_order(db, order, business_id)

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
