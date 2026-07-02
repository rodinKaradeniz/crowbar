import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import DomainEvent, publish
from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_module
from app.models.business import Business
from app.models.tab import Tab
from app.models.user import User
from app.schemas.order import OrderPlaceRequest, OrderResponse
from app.schemas.tab import TabCloseRequest, TabOpenRequest, TabResponse
from app.services import tab_service

logger = logging.getLogger(__name__)

# Tabs are a feature of the ordering module, not a module of their own.
router = APIRouter(
    prefix="/api/tabs",
    tags=["tabs"],
    dependencies=[Depends(require_module("ordering"))],
)


async def _tab_response(db: AsyncSession, tab: Tab) -> TabResponse:
    """Assemble a TabResponse with the on-demand total and associated orders."""
    orders = await tab_service.get_tab_orders(db, tab.id)
    total = await tab_service.get_tab_total(db, tab.id)
    return TabResponse(
        id=tab.id,
        business_id=tab.business_id,
        table_id=tab.table_id,
        customer_id=tab.customer_id,
        status=tab.status,
        channel=tab.channel,
        opened_by=tab.opened_by,
        opened_at=tab.opened_at,
        closed_by=tab.closed_by,
        closed_at=tab.closed_at,
        settled_method=tab.settled_method,
        total=total,
        orders=orders,
    )


@router.post("", response_model=TabResponse, status_code=status.HTTP_201_CREATED)
async def open_tab(
    body: TabOpenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    tab = await tab_service.open_tab(
        db,
        business_id=business.id,
        opened_by=current_user.id,
        table_id=body.table_id,
        customer_id=body.customer_id,
        channel=body.channel,
    )
    await db.commit()
    return await _tab_response(db, tab)


@router.get("", response_model=list[TabResponse])
async def list_tabs(
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    """List the business's tabs (optionally filter by ?status=open|closed)."""
    tabs = await tab_service.list_tabs(db, business.id, status)
    return [await _tab_response(db, tab) for tab in tabs]


@router.get("/{tab_id}", response_model=TabResponse)
async def get_tab(
    tab_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    tab = await tab_service.get_tab(db, business.id, tab_id)
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found")
    return await _tab_response(db, tab)


@router.post(
    "/{tab_id}/orders",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_order_to_tab(
    tab_id: UUID,
    body: OrderPlaceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    tab = await tab_service.get_tab(db, business.id, tab_id)
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found")
    if tab.status != "open":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Tab is closed"
        )
    order = await tab_service.add_order_to_tab(db, business.id, tab_id, body)
    await db.commit()
    # Tab orders still flow through the ticket board — emit order.placed so the
    # WS-driven board picks them up exactly like a standalone order.
    await publish(DomainEvent(
        event_type="order.placed",
        business_id=str(business.id),
        payload={"order_id": str(order.id), "tab_id": str(tab_id)},
    ))
    return order


@router.post("/{tab_id}/close", response_model=TabResponse)
async def close_tab(
    tab_id: UUID,
    body: TabCloseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    tab = await tab_service.get_tab(db, business.id, tab_id)
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found")
    if tab.status != "open":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Tab is already closed"
        )
    tab = await tab_service.close_tab(db, tab, current_user.id, body.settled_method)
    await db.commit()
    return await _tab_response(db, tab)
