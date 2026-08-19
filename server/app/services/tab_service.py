"""Running tabs and audited external-register settlement assertions."""

import hashlib
import json
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business import Business
from app.models.order import Order
from app.models.queue_entry import QueueEntry
from app.models.reservation import Reservation
from app.models.tab import Tab, TabSettlementEvent
from app.models.table import Table
from app.models.table_seating import TableSeating, TableSeatingTable
from app.schemas.order import OrderPlaceRequest
from app.schemas.tab import TabReopenRequest, TabSettleExternallyRequest
from app.services import order_service


class TabCommandError(ValueError):
    pass


def _fingerprint(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


async def open_tab(
    db: AsyncSession,
    business_id: UUID,
    opened_by: UUID | None,
    table_id: UUID | None = None,
    customer_id: UUID | None = None,
    channel: str = "staff",
) -> Tab:
    if table_id is not None:
        table = await db.scalar(
            select(Table).where(
                Table.id == table_id,
                Table.business_id == business_id,
                Table.is_active.is_(True),
                Table.deleted_at.is_(None),
            )
        )
        if table is None:
            raise ValueError("Table not found")
    tab = Tab(
        business_id=business_id,
        table_id=table_id,
        customer_id=customer_id,
        channel=channel,
        opened_by=opened_by,
        status="open",
    )
    db.add(tab)
    await db.flush()
    return tab


async def open_seating_tab(
    db: AsyncSession,
    *,
    business_id: UUID,
    seating_id: UUID,
    opened_by: UUID | None,
    table_id: UUID | None = None,
    channel: str,
) -> Tab:
    seating = await db.scalar(
        select(TableSeating)
        .where(
            TableSeating.id == seating_id,
            TableSeating.business_id == business_id,
        )
        .with_for_update()
    )
    if seating is None:
        raise ValueError("Seating not found")
    if seating.status != "open":
        raise ValueError("This seating has already ended")
    tab = await db.scalar(
        select(Tab)
        .where(
            Tab.business_id == business_id,
            Tab.seating_id == seating.id,
        )
        .order_by(Tab.opened_at.desc())
        .with_for_update()
    )
    if tab is not None:
        if tab.status == "open":
            return tab
        raise ValueError("This seating's tab is settled externally")
    table_ids = list(
        (
            await db.scalars(
                select(TableSeatingTable.table_id).where(
                    TableSeatingTable.seating_id == seating.id
                )
            )
        ).all()
    )
    if table_id is not None and table_id not in table_ids:
        raise ValueError("Table is not part of this seating")
    customer_id = None
    if seating.reservation_id:
        customer_id = await db.scalar(
            select(Reservation.customer_id).where(
                Reservation.id == seating.reservation_id
            )
        )
    elif seating.queue_entry_id:
        customer_id = await db.scalar(
            select(QueueEntry.customer_id).where(
                QueueEntry.id == seating.queue_entry_id
            )
        )
    tab = Tab(
        business_id=business_id,
        seating_id=seating.id,
        table_id=table_id or table_ids[0],
        customer_id=customer_id,
        channel=channel,
        opened_by=opened_by,
        status="open",
    )
    db.add(tab)
    await db.flush()
    return tab


async def active_seating_for_table(
    db: AsyncSession, *, business_id: UUID, table_id: UUID
) -> UUID | None:
    return await db.scalar(
        select(TableSeating.id)
        .join(TableSeatingTable, TableSeatingTable.seating_id == TableSeating.id)
        .where(
            TableSeating.business_id == business_id,
            TableSeatingTable.table_id == table_id,
            TableSeating.status == "open",
        )
    )


async def get_tab(
    db: AsyncSession, business_id: UUID, tab_id: UUID, *, lock: bool = False
) -> Tab | None:
    query = select(Tab).where(Tab.id == tab_id, Tab.business_id == business_id)
    if lock:
        query = query.with_for_update()
    return await db.scalar(query)


async def list_tabs(
    db: AsyncSession, business_id: UUID, status: str | None = None
) -> list[Tab]:
    query = select(Tab).where(Tab.business_id == business_id)
    if status:
        query = query.where(Tab.status == status)
    rows = await db.scalars(query.order_by(Tab.opened_at.desc()))
    return list(rows.all())


async def get_tab_orders(db: AsyncSession, tab_id: UUID) -> list[Order]:
    rows = await db.scalars(
        select(Order)
        .where(Order.tab_id == tab_id)
        .options(
            selectinload(Order.line_items),
            selectinload(Order.status_timeline),
        )
        .order_by(Order.placed_at)
    )
    return list(rows.unique().all())


async def get_tab_total(db: AsyncSession, tab_id: UUID) -> Decimal:
    value = await db.scalar(
        select(func.coalesce(func.sum(Order.total_amount), 0)).where(
            Order.tab_id == tab_id,
            Order.status != "cancelled",
        )
    )
    return Decimal(str(value or 0))


async def get_settlement_events(
    db: AsyncSession, business_id: UUID, tab_id: UUID
) -> list[TabSettlementEvent]:
    rows = await db.scalars(
        select(TabSettlementEvent)
        .where(
            TabSettlementEvent.business_id == business_id,
            TabSettlementEvent.tab_id == tab_id,
        )
        .order_by(TabSettlementEvent.occurred_at, TabSettlementEvent.id)
    )
    return list(rows.all())


async def add_order_to_tab(
    db: AsyncSession,
    business_id: UUID,
    tab_id: UUID,
    request: OrderPlaceRequest,
) -> tuple[Order, bool]:
    tab = await get_tab(db, business_id, tab_id, lock=True)
    if tab is None or tab.status != "open":
        raise ValueError("Tab is not open")
    order, created = await order_service.place_order(
        db,
        business_id,
        request,
        require_age_confirmation=False,
        table_id=tab.table_id,
        tab_id=tab_id,
        customer_id=tab.customer_id,
        channel="staff",
    )
    await db.flush()
    await db.refresh(order, ["line_items", "status_timeline"])
    return order, created


async def _existing_command(
    db: AsyncSession,
    *,
    business_id: UUID,
    idempotency_key: str,
    fingerprint: str,
) -> TabSettlementEvent | None:
    event = await db.scalar(
        select(TabSettlementEvent).where(
            TabSettlementEvent.business_id == business_id,
            TabSettlementEvent.idempotency_key == idempotency_key,
        )
    )
    if event is not None and event.command_fingerprint != fingerprint:
        raise TabCommandError(
            "This idempotency key was already used for a different tab command"
        )
    return event


async def settle_externally(
    db: AsyncSession,
    *,
    business_id: UUID,
    tab_id: UUID,
    actor_id: UUID,
    request: TabSettleExternallyRequest,
) -> tuple[Tab | None, bool]:
    fingerprint = _fingerprint({
        "command": "settle_externally",
        "tab_id": str(tab_id),
        "informational_method": request.informational_method,
        "note": request.note,
        "external_register_reference": request.external_register_reference,
    })
    existing = await _existing_command(
        db,
        business_id=business_id,
        idempotency_key=request.idempotency_key,
        fingerprint=fingerprint,
    )
    if existing is not None:
        return await get_tab(db, business_id, existing.tab_id), False
    tab = await get_tab(db, business_id, tab_id, lock=True)
    if tab is None:
        return None, False
    if tab.status != "open":
        raise TabCommandError("This tab is already settled externally")
    orders = await get_tab_orders(db, tab.id)
    currencies = {order.currency_code for order in orders if order.status != "cancelled"}
    business = await db.get(Business, business_id)
    if business is None:
        raise TabCommandError("Business not found")
    if len(currencies) > 1:
        raise TabCommandError("Tab orders do not share one currency")
    currency = next(iter(currencies), business.currency_code)
    event = TabSettlementEvent(
        business_id=business_id,
        tab_id=tab.id,
        event_type="settled_externally",
        actor_id=actor_id,
        currency_code=currency,
        total_snapshot=await get_tab_total(db, tab.id),
        informational_method=request.informational_method,
        note=request.note,
        external_register_reference=request.external_register_reference,
        idempotency_key=request.idempotency_key,
        command_fingerprint=fingerprint,
    )
    db.add(event)
    await db.flush()
    tab.status = "settled_externally"
    tab.current_settlement_event_id = event.id
    await db.flush()
    return tab, True


async def reopen_tab(
    db: AsyncSession,
    *,
    business_id: UUID,
    tab_id: UUID,
    actor_id: UUID,
    request: TabReopenRequest,
) -> tuple[Tab | None, bool]:
    fingerprint = _fingerprint({
        "command": "reopen",
        "tab_id": str(tab_id),
        "reason": request.reason,
    })
    existing = await _existing_command(
        db,
        business_id=business_id,
        idempotency_key=request.idempotency_key,
        fingerprint=fingerprint,
    )
    if existing is not None:
        return await get_tab(db, business_id, existing.tab_id), False
    tab = await get_tab(db, business_id, tab_id, lock=True)
    if tab is None:
        return None, False
    if tab.status != "settled_externally" or tab.current_settlement_event_id is None:
        raise TabCommandError("Only a settled tab can be reopened")
    if tab.seating_id is not None:
        seating = await db.scalar(
            select(TableSeating)
            .where(
                TableSeating.id == tab.seating_id,
                TableSeating.business_id == business_id,
            )
            .with_for_update()
        )
        if seating is None or seating.status != "open":
            raise TabCommandError("A tab cannot be reopened after its seating has ended")
    settlement = await db.get(TabSettlementEvent, tab.current_settlement_event_id)
    if settlement is None:
        raise TabCommandError("The settlement audit is unavailable")
    event = TabSettlementEvent(
        business_id=business_id,
        tab_id=tab.id,
        event_type="reopened",
        actor_id=actor_id,
        currency_code=settlement.currency_code,
        total_snapshot=settlement.total_snapshot,
        note=request.reason,
        related_settlement_event_id=settlement.id,
        idempotency_key=request.idempotency_key,
        command_fingerprint=fingerprint,
    )
    db.add(event)
    tab.status = "open"
    tab.current_settlement_event_id = None
    await db.flush()
    return tab, True
