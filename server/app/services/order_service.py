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
from app.models.order import (
    Order,
    OrderLineItem,
    OrderLineStatusTimeline,
    OrderRevision,
    OrderStatusTimeline,
)
from app.models.preparation_station import PreparationStation
from app.models.tab import Tab
from app.models.table import Table
from app.schemas.order import (
    OrderCancellationRequest,
    OrderCorrectionRequest,
    OrderLineStatusUpdateRequest,
    OrderPlaceRequest,
    OrderStatusUpdateRequest,
)
from app.services import happy_hour_service, recipe_service, tax_service
from app.services.floor_plan_service import resolve_service_window
from app.services.public_session_service import hash_token

logger = logging.getLogger(__name__)

# Valid status transitions. Forward advances the fulfillment flow; the backward
# entries (previous-step only) let staff correct an accidental click. Moving
# backward out of 'served' reverses the recipe deduction (see advance_order_status);
# every other backward step has no inventory side effect. 'cancelled' is a terminal
# side-exit (no un-cancel in this pass).
_TRANSITIONS: dict[str, list[str]] = {
    "received": ["preparing"],
    "preparing": ["received", "ready"],
    "ready": ["preparing", "served"],
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
    for item in items_by_id.values():
        if item.routes_to_all_stations:
            continue
        station_exists = await db.scalar(
            select(PreparationStation.id).where(
                PreparationStation.id == item.preparation_station_id,
                PreparationStation.business_id == business_id,
                PreparationStation.is_active.is_(True),
            )
        )
        if station_exists is None:
            raise OrderValidationError(
                f"The preparation station for {item.name} is unavailable"
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


async def _load_order(
    db: AsyncSession, order_id: UUID, business_id: UUID, *, lock: bool = False
) -> Order | None:
    query = (
        select(Order)
        .where(Order.id == order_id, Order.business_id == business_id)
        .options(
            selectinload(Order.line_items),
            selectinload(Order.status_timeline),
        )
    )
    if lock:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one_or_none()


def order_to_dict(order: Order) -> dict:
    return {
        "id": str(order.id),
        "business_id": str(order.business_id),
        "location_id": str(order.location_id) if order.location_id else None,
        "table_id": str(order.table_id) if order.table_id else None,
        "tab_id": str(order.tab_id) if order.tab_id else None,
        "table_identifier": order.table_identifier,
        "status": order.status,
        "idempotency_key": order.idempotency_key,
        "currency_code": order.currency_code,
        "subtotal_amount": float(order.subtotal_amount),
        "tax_amount": float(order.tax_amount),
        "total_amount": float(order.total_amount),
        "notes": order.notes,
        "placed_at": order.placed_at.isoformat() if order.placed_at else None,
        "cancelled_by": str(order.cancelled_by) if order.cancelled_by else None,
        "cancelled_at": order.cancelled_at.isoformat() if order.cancelled_at else None,
        "cancellation_reason": order.cancellation_reason,
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
                "preparation_station_id": (
                    str(li.preparation_station_id) if li.preparation_station_id else None
                ),
                "preparation_station_name": li.preparation_station_name,
                "routes_to_all_stations": li.routes_to_all_stations,
                "line_status": li.line_status,
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
        session_token_hash=hash_token(session_token),
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
            business_id=business_id,
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
            preparation_station_id=item.preparation_station_id,
            preparation_station_name=(
                None
                if item.routes_to_all_stations
                else await db.scalar(
                    select(PreparationStation.name).where(
                        PreparationStation.id == item.preparation_station_id,
                        PreparationStation.business_id == business_id,
                        PreparationStation.is_active.is_(True),
                    )
                )
            ),
            routes_to_all_stations=item.routes_to_all_stations,
            line_status="received",
            is_alcoholic=item.is_alcoholic,
            notes=item_req.notes,
        )
        db.add(li)

    order.subtotal_amount = subtotal
    order.tax_amount = tax_total
    order.total_amount = total
    db.add(
        OrderStatusTimeline(
            business_id=business_id,
            order_id=order.id,
            status="received",
        )
    )
    await db.flush()
    await db.refresh(order, ["line_items", "status_timeline"])
    order.public_session_token = session_token
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
    order = await _load_order(db, order_id, business_id, lock=True)
    if order is None:
        return None

    from_status = order.status
    transitioned = False
    for line in sorted(order.line_items, key=lambda item: str(item.id)):
        if line.line_status == "cancelled" or request.status not in _TRANSITIONS.get(line.line_status, []):
            continue
        await _transition_line(db, order, line, request.status, changed_by)
        transitioned = True
    if not transitioned:
        raise ValueError(f"No order lines can transition to '{request.status}'")
    _recompute_order_status(order)
    db.add(
        OrderStatusTimeline(
            business_id=business_id,
            order_id=order.id,
            from_status=from_status,
            status=order.status,
            changed_by=changed_by,
            changed_at=datetime.now(timezone.utc),
        )
    )
    await db.flush()

    await db.refresh(order, ["line_items", "status_timeline"])
    return order


def _recompute_order_status(order: Order) -> None:
    statuses = [line.line_status for line in order.line_items]
    active = [value for value in statuses if value != "cancelled"]
    if not active:
        order.status = "cancelled"
        return
    rank = {"received": 0, "preparing": 1, "ready": 2, "served": 3}
    order.status = min(active, key=lambda value: rank[value])


async def _transition_line(
    db: AsyncSession,
    order: Order,
    line: OrderLineItem,
    target: str,
    changed_by: UUID | None,
) -> None:
    source = line.line_status
    if target not in _TRANSITIONS.get(source, []):
        raise ValueError(
            f"Cannot transition line from '{source}' to '{target}'"
        )
    line.line_status = target
    db.add(
        OrderLineStatusTimeline(
            business_id=order.business_id,
            order_line_item_id=line.id,
            from_status=source,
            status=target,
            changed_by=changed_by,
        )
    )
    if source != "served" and target == "served":
        await recipe_service.deduct_for_served_line(
            db, order, line, order.business_id
        )
    elif source == "served" and target != "served":
        await recipe_service.reverse_deduction_for_line(
            db, order, line, order.business_id
        )


async def advance_order_line_status(
    db: AsyncSession,
    *,
    business_id: UUID,
    order_id: UUID,
    line_id: UUID,
    request: OrderLineStatusUpdateRequest,
    changed_by: UUID,
) -> Order | None:
    order = await _load_order(db, order_id, business_id, lock=True)
    if order is None:
        return None
    line = next((item for item in order.line_items if item.id == line_id), None)
    if line is None:
        return None
    from_order_status = order.status
    await _transition_line(db, order, line, request.status, changed_by)
    _recompute_order_status(order)
    if order.status != from_order_status:
        db.add(OrderStatusTimeline(
            business_id=business_id,
            order_id=order.id,
            from_status=from_order_status,
            status=order.status,
            changed_by=changed_by,
        ))
    await db.flush()
    await db.refresh(order, ["line_items", "status_timeline"])
    return order


def _command_fingerprint(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


async def _existing_revision(
    db: AsyncSession,
    *,
    business_id: UUID,
    idempotency_key: str,
    fingerprint: str,
) -> OrderRevision | None:
    revision = await db.scalar(
        select(OrderRevision).where(
            OrderRevision.business_id == business_id,
            OrderRevision.idempotency_key == idempotency_key,
        )
    )
    if revision is not None and revision.command_fingerprint != fingerprint:
        raise OrderIdempotencyConflict(
            "This idempotency key was already used for a different order command"
        )
    return revision


async def _lock_economic_order(
    db: AsyncSession, business_id: UUID, order_id: UUID
) -> tuple[Order | None, Tab | None]:
    order = await _load_order(db, order_id, business_id, lock=True)
    if order is None:
        return None, None
    tab = None
    if order.tab_id is not None:
        tab = await db.scalar(
            select(Tab)
            .where(Tab.id == order.tab_id, Tab.business_id == business_id)
            .with_for_update()
        )
        if tab is None:
            raise OrderValidationError("The linked tab is unavailable")
    return order, tab


async def _build_corrected_lines(
    db: AsyncSession,
    *,
    order: Order,
    request: OrderCorrectionRequest,
) -> tuple[list[OrderLineItem], Decimal, Decimal, Decimal]:
    placement_shape = OrderPlaceRequest(
        items=request.items,
        notes=request.notes,
        idempotency_key="correction-resolution",
        age_confirmed=True,
    )
    resolved = await _resolve_cart(
        db,
        business_id=order.business_id,
        request=placement_shape,
        location_id=order.location_id,
    )
    business = await db.get(Business, order.business_id)
    if business is None:
        raise OrderValidationError("Business not found")
    now = datetime.now(timezone.utc)
    happy_hour_active = await happy_hour_service.is_happy_hour_active(
        db, order.business_id
    )
    lines: list[OrderLineItem] = []
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    total = Decimal("0")
    for item_request, item, modifiers in resolved:
        unit_price = (
            item.happy_hour_price
            if happy_hour_active and item.happy_hour_price is not None
            else item.price
        )
        selected_modifiers = []
        for modifier in modifiers:
            unit_price += modifier.price_delta
            selected_modifiers.append({
                "modifier_id": str(modifier.id),
                "name": modifier.name,
                "price_delta": float(modifier.price_delta),
            })
        profile, version = await tax_service.resolve_profile_version(
            db, order.business_id, item.tax_profile_id, now
        )
        line_subtotal, line_tax, line_total = tax_service.calculate_line_tax(
            unit_price * item_request.quantity,
            version.rate,
            version.price_includes_tax,
            business.currency_code,
        )
        station_name = None
        if not item.routes_to_all_stations:
            station_name = await db.scalar(
                select(PreparationStation.name).where(
                    PreparationStation.id == item.preparation_station_id,
                    PreparationStation.business_id == order.business_id,
                    PreparationStation.is_active.is_(True),
                )
            )
            if station_name is None:
                raise OrderValidationError(
                    f"The preparation station for {item.name} is unavailable"
                )
        lines.append(OrderLineItem(
            business_id=order.business_id,
            order_id=order.id,
            item_id=item.id,
            item_name=item.name,
            quantity=item_request.quantity,
            unit_price=unit_price,
            currency_code=business.currency_code,
            tax_profile_id=profile.id,
            tax_profile_version_id=version.id,
            tax_profile_name=version.name,
            tax_profile_code=profile.code,
            tax_rate=version.rate,
            price_includes_tax=version.price_includes_tax,
            subtotal_amount=line_subtotal,
            tax_amount=line_tax,
            total_amount=line_total,
            selected_modifiers=selected_modifiers,
            routing_tag=item.routing_tag,
            preparation_station_id=item.preparation_station_id,
            preparation_station_name=station_name,
            routes_to_all_stations=item.routes_to_all_stations,
            line_status="received",
            is_alcoholic=item.is_alcoholic,
            notes=item_request.notes,
        ))
        subtotal += line_subtotal
        tax_total += line_tax
        total += line_total
    return lines, subtotal, tax_total, total


async def correct_order(
    db: AsyncSession,
    *,
    business_id: UUID,
    order_id: UUID,
    request: OrderCorrectionRequest,
    actor_id: UUID,
) -> tuple[Order | None, bool]:
    fingerprint = _command_fingerprint({
        "command": "correct",
        "order_id": str(order_id),
        "reason": request.reason,
        "notes": request.notes,
        "items": [
            {
                "item_id": str(item.item_id),
                "quantity": item.quantity,
                "modifier_ids": sorted(str(value.modifier_id) for value in item.selected_modifiers),
                "notes": item.notes,
            }
            for item in request.items
        ],
    })
    existing = await _existing_revision(
        db,
        business_id=business_id,
        idempotency_key=request.idempotency_key,
        fingerprint=fingerprint,
    )
    if existing is not None:
        return await _load_order(db, order_id, business_id), False
    order, tab = await _lock_economic_order(db, business_id, order_id)
    if order is None:
        return None, False
    if tab is not None and tab.status != "open":
        raise OrderValidationError("Settled tabs cannot be corrected")
    if order.status == "cancelled" or any(
        line.line_status != "received" for line in order.line_items
    ):
        raise OrderValidationError(
            "An order can only be corrected before preparation starts"
        )
    before = order_to_dict(order)
    new_lines, subtotal, tax_total, total = await _build_corrected_lines(
        db, order=order, request=request
    )
    for line in list(order.line_items):
        await db.delete(line)
    await db.flush()
    for line in new_lines:
        db.add(line)
    order.notes = request.notes
    order.subtotal_amount = subtotal
    order.tax_amount = tax_total
    order.total_amount = total
    await db.flush()
    await db.refresh(order, ["line_items", "status_timeline"])
    after = order_to_dict(order)
    db.add(OrderRevision(
        business_id=business_id,
        order_id=order.id,
        actor_id=actor_id,
        reason=request.reason,
        idempotency_key=request.idempotency_key,
        command_fingerprint=fingerprint,
        before_snapshot=before,
        after_snapshot=after,
    ))
    await db.flush()
    return order, True


async def cancel_order(
    db: AsyncSession,
    *,
    business_id: UUID,
    order_id: UUID,
    request: OrderCancellationRequest,
    actor_id: UUID,
) -> tuple[Order | None, bool]:
    fingerprint = _command_fingerprint({
        "command": "cancel",
        "order_id": str(order_id),
        "reason": request.reason,
    })
    existing = await _existing_revision(
        db,
        business_id=business_id,
        idempotency_key=request.idempotency_key,
        fingerprint=fingerprint,
    )
    if existing is not None:
        return await _load_order(db, order_id, business_id), False
    order, tab = await _lock_economic_order(db, business_id, order_id)
    if order is None:
        return None, False
    if tab is not None and tab.status != "open":
        raise OrderValidationError("Orders cannot be cancelled after external settlement")
    if order.status == "cancelled":
        raise OrderValidationError("This order is already cancelled")
    before = order_to_dict(order)
    now = datetime.now(timezone.utc)
    for line in order.line_items:
        await recipe_service.reverse_deduction_for_line(
            db, order, line, business_id
        )
        if line.line_status != "cancelled":
            db.add(OrderLineStatusTimeline(
                business_id=business_id,
                order_line_item_id=line.id,
                from_status=line.line_status,
                status="cancelled",
                changed_by=actor_id,
                changed_at=now,
            ))
            line.line_status = "cancelled"
    # Migration-020 movements have no line link and retain exact order-level reversal.
    await recipe_service.reverse_deduction_for_order(db, order, business_id)
    from_status = order.status
    order.status = "cancelled"
    order.cancelled_by = actor_id
    order.cancelled_at = now
    order.cancellation_reason = request.reason
    db.add(OrderStatusTimeline(
        business_id=business_id,
        order_id=order.id,
        from_status=from_status,
        status="cancelled",
        changed_by=actor_id,
        changed_at=now,
    ))
    await db.flush()
    await db.refresh(order, ["line_items", "status_timeline"])
    after = order_to_dict(order)
    db.add(OrderRevision(
        business_id=business_id,
        order_id=order.id,
        actor_id=actor_id,
        reason=request.reason,
        idempotency_key=request.idempotency_key,
        command_fingerprint=fingerprint,
        before_snapshot=before,
        after_snapshot=after,
    ))
    await db.flush()
    return order, True


async def get_all_day_counts(
    db: AsyncSession, business_id: UUID
) -> list[dict]:
    start = await _business_day_start_utc(db, business_id)
    rows = await db.execute(
        select(
            OrderLineItem.preparation_station_id,
            OrderLineItem.preparation_station_name,
            OrderLineItem.routes_to_all_stations,
            OrderLineItem.item_name,
            OrderLineItem.line_status,
            func.sum(OrderLineItem.quantity),
        )
        .join(Order, Order.id == OrderLineItem.order_id)
        .where(
            Order.business_id == business_id,
            Order.placed_at >= start,
            OrderLineItem.line_status != "cancelled",
        )
        .group_by(
            OrderLineItem.preparation_station_id,
            OrderLineItem.preparation_station_name,
            OrderLineItem.routes_to_all_stations,
            OrderLineItem.item_name,
            OrderLineItem.line_status,
        )
        .order_by(
            OrderLineItem.preparation_station_name,
            OrderLineItem.item_name,
            OrderLineItem.line_status,
        )
    )
    return [
        {
            "preparation_station_id": station_id,
            "preparation_station_name": station_name,
            "routes_to_all_stations": shared,
            "item_name": item_name,
            "line_status": line_status,
            "quantity": int(quantity),
        }
        for station_id, station_name, shared, item_name, line_status, quantity in rows.all()
    ]


async def get_order_by_session(
    db: AsyncSession, business_id: UUID, session_token: str
) -> list[Order]:
    """Return all orders for a customer session (most recent first)."""
    result = await db.execute(
        select(Order)
        .where(
            Order.business_id == business_id,
            Order.session_token_hash == hash_token(session_token),
        )
        .options(selectinload(Order.line_items), selectinload(Order.status_timeline))
        .order_by(Order.placed_at.desc())
    )
    return list(result.scalars().unique().all())
