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
from app.models.tab import Tab
from app.schemas.order import OrderPlaceRequest
from app.services import order_service


async def open_tab(
    db: AsyncSession,
    business_id: UUID,
    opened_by: UUID,
    table_id: UUID | None = None,
    customer_id: UUID | None = None,
    channel: str = "staff",
) -> Tab:
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
) -> Order:
    """Thin wrapper: create the order via order_service, then stamp tab_id.

    Callers must validate that the tab exists and is open (see router).
    """
    # Staff-entered order (in-person) — skip the customer self-service age gate.
    order = await order_service.place_order(
        db, business_id, request, require_age_confirmation=False
    )
    order.tab_id = tab_id
    await db.flush()
    await db.refresh(order, ["line_items", "status_timeline"])
    return order


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
