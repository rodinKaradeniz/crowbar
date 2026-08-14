"""Tab service — open/append/close an order-grouping tab.

A tab groups multiple discrete orders under one running total. The total is
computed on demand via SUM() over the tab's associated (non-cancelled) orders —
there is no denormalized column, mirroring the compute-on-demand pattern of
inventory_service.recompute_quantity_from_movements.

Settlement is simulated: close_tab records a settled_method with no payment
processing behind it.
"""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order import Order
from app.models.table import Table
from app.models.tab import Tab
from app.models.table_seating import TableSeating, TableSeatingTable
from app.models.reservation import Reservation
from app.models.queue_entry import QueueEntry
from app.schemas.order import OrderPlaceRequest
from app.services import order_service


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
    await db.refresh(tab)
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
    """Return a seating's one open tab, creating it under the seating lock."""
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
        select(Tab).where(
            Tab.business_id == business_id,
            Tab.seating_id == seating.id,
            Tab.status == "open",
        )
    )
    if tab is not None:
        return tab
    seating_table_ids = list(
        (
            await db.execute(
                select(TableSeatingTable.table_id).where(
                    TableSeatingTable.seating_id == seating.id
                )
            )
        ).scalars().all()
    )
    if table_id is not None and table_id not in seating_table_ids:
        raise ValueError("Table is not part of this seating")
    customer_id = None
    if seating.reservation_id:
        customer_id = await db.scalar(
            select(Reservation.customer_id).where(Reservation.id == seating.reservation_id)
        )
    elif seating.queue_entry_id:
        customer_id = await db.scalar(
            select(QueueEntry.customer_id).where(QueueEntry.id == seating.queue_entry_id)
        )
    tab = Tab(
        business_id=business_id,
        seating_id=seating.id,
        table_id=table_id or seating_table_ids[0],
        customer_id=customer_id,
        channel=channel,
        opened_by=opened_by,
        status="open",
    )
    db.add(tab)
    await db.flush()
    await db.refresh(tab)
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


async def get_tab(db: AsyncSession, business_id: UUID, tab_id: UUID) -> Tab | None:
    result = await db.execute(
        select(Tab).where(Tab.id == tab_id, Tab.business_id == business_id)
    )
    return result.scalar_one_or_none()


async def list_tabs(
    db: AsyncSession, business_id: UUID, status: str | None = None
) -> list[Tab]:
    """List a business's tabs, most-recently-opened first. Optional status filter."""
    q = select(Tab).where(Tab.business_id == business_id)
    if status:
        q = q.where(Tab.status == status)
    q = q.order_by(Tab.opened_at.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_tab_orders(db: AsyncSession, tab_id: UUID) -> list[Order]:
    result = await db.execute(
        select(Order)
        .where(Order.tab_id == tab_id)
        .options(
            selectinload(Order.line_items),
            selectinload(Order.status_timeline),
        )
        .order_by(Order.placed_at)
    )
    return list(result.scalars().unique().all())


async def get_tab_total(db: AsyncSession, tab_id: UUID) -> Decimal:
    """Live SUM over the tab's non-cancelled orders. Never denormalized."""
    result = await db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0)).where(
            Order.tab_id == tab_id,
            Order.status != "cancelled",
        )
    )
    return Decimal(str(result.scalar_one()))


async def add_order_to_tab(
    db: AsyncSession,
    business_id: UUID,
    tab_id: UUID,
    request: OrderPlaceRequest,
) -> tuple[Order, bool]:
    """Thin wrapper: create the order via order_service, then stamp tab_id.

    Callers must validate that the tab exists and is open (see router).
    """
    tab = await get_tab(db, business_id, tab_id)
    if tab is None or tab.status != "open":
        raise ValueError("Tab is not open")
    # Staff-entered order (in-person) — skip the customer self-service age gate.
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


async def close_tab(
    db: AsyncSession,
    tab: Tab,
    closed_by: UUID,
    settled_method: str,
) -> Tab:
    """Close an already-loaded, open tab. The caller (router) validates existence
    and that the tab is still open (returns 409 otherwise), mirroring the
    add-order-to-tab flow."""
    tab.status = "closed"
    tab.closed_by = closed_by
    tab.closed_at = datetime.now(timezone.utc)
    tab.settled_method = settled_method
    await db.flush()
    await db.refresh(tab)
    return tab
