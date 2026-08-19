import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import DomainEvent, publish
from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_module, require_roles
from app.models.business import Business
from app.models.tab import Tab
from app.models.user import User
from app.schemas.order import OrderPlaceRequest, OrderResponse
from app.schemas.tab import TabOpenRequest, TabReopenRequest, TabResponse, TabSettleExternallyRequest
from app.services import order_service, tab_service
from app.services.tab_ws_manager import manager as tab_ws_manager
from app.services.websocket_auth import authorize_staff_websocket

logger = logging.getLogger(__name__)

# Tabs are a feature of the ordering module, not a module of their own.
router = APIRouter(
    prefix="/api/tabs",
    tags=["tabs"],
    dependencies=[Depends(require_module("ordering"))],
)
ws_router = APIRouter(tags=["tabs"])


async def _tab_response(db: AsyncSession, tab: Tab) -> TabResponse:
    """Assemble a TabResponse with the on-demand total and associated orders."""
    orders = await tab_service.get_tab_orders(db, tab.id)
    total = await tab_service.get_tab_total(db, tab.id)
    events = await tab_service.get_settlement_events(db, tab.business_id, tab.id)
    return TabResponse(
        id=tab.id,
        business_id=tab.business_id,
        table_id=tab.table_id,
        seating_id=tab.seating_id,
        customer_id=tab.customer_id,
        status=tab.status,
        channel=tab.channel,
        opened_by=tab.opened_by,
        opened_at=tab.opened_at,
        closed_by=tab.closed_by,
        closed_at=tab.closed_at,
        settled_method=tab.settled_method,
        current_settlement_event_id=tab.current_settlement_event_id,
        settlement_events=events,
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
    try:
        if body.table_id:
            seating_id = await tab_service.active_seating_for_table(
                db, business_id=business.id, table_id=body.table_id
            )
            if seating_id is None:
                raise ValueError("Start a table tab from an active seating")
            tab = await tab_service.open_seating_tab(
                db,
                business_id=business.id,
                seating_id=seating_id,
                opened_by=current_user.id,
                table_id=body.table_id,
                channel=body.channel,
            )
        else:
            tab = await tab_service.open_tab(
                db,
                business_id=business.id,
                opened_by=current_user.id,
                customer_id=body.customer_id,
                channel=body.channel,
            )
    except ValueError as exc:
        status_code = (
            status.HTTP_404_NOT_FOUND
            if str(exc) == "Table not found"
            else status.HTTP_409_CONFLICT
        )
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    await db.commit()
    if tab.seating_id:
        await publish(DomainEvent(
            event_type="floor_plan.tab_opened",
            business_id=str(business.id),
            payload={"tab_id": str(tab.id), "seating_id": str(tab.seating_id)},
        ))
    return await _tab_response(db, tab)


@router.post("/seatings/{seating_id}", response_model=TabResponse)
async def open_seating_tab(
    seating_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    try:
        tab = await tab_service.open_seating_tab(
            db,
            business_id=business.id,
            seating_id=seating_id,
            opened_by=current_user.id,
            channel="staff",
        )
    except ValueError as exc:
        status_code = (
            status.HTTP_404_NOT_FOUND
            if str(exc) == "Seating not found"
            else status.HTTP_409_CONFLICT
        )
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    await db.commit()
    await publish(DomainEvent(
        event_type="floor_plan.tab_opened",
        business_id=str(business.id),
        payload={"tab_id": str(tab.id), "seating_id": str(seating_id)},
    ))
    return await _tab_response(db, tab)


@router.get("", response_model=list[TabResponse])
async def list_tabs(
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    """List the business's tabs (optionally filter by open or settled_externally)."""
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
            status_code=status.HTTP_409_CONFLICT, detail="Tab is settled externally"
        )
    try:
        order, created = await tab_service.add_order_to_tab(
            db, business.id, tab_id, body
        )
    except order_service.OrderIdempotencyConflict as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except order_service.OrderValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    await db.commit()
    # Tab orders still flow through the ticket board — emit order.placed so the
    # WS-driven board picks them up exactly like a standalone order.
    if created:
        await publish(DomainEvent(
            event_type="order.placed",
            business_id=str(business.id),
            payload={"order_id": str(order.id), "tab_id": str(tab_id)},
        ))
    if created and tab.seating_id:
        await publish(DomainEvent(
            event_type="floor_plan.tab_updated",
            business_id=str(business.id),
            payload={"tab_id": str(tab.id), "seating_id": str(tab.seating_id)},
        ))
    return order


@router.post("/{tab_id}/settle-externally", response_model=TabResponse)
async def settle_tab_externally(
    tab_id: UUID,
    body: TabSettleExternallyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    try:
        tab, changed = await tab_service.settle_externally(
            db,
            business_id=business.id,
            tab_id=tab_id,
            actor_id=current_user.id,
            request=body,
        )
    except tab_service.TabCommandError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found")
    await db.commit()
    if changed:
        await publish(DomainEvent(
            event_type="tab.settled_externally",
            business_id=str(business.id),
            payload={"tab_id": str(tab.id), "seating_id": str(tab.seating_id)},
        ))
    return await _tab_response(db, tab)


@router.post(
    "/{tab_id}/reopen",
    response_model=TabResponse,
    dependencies=[Depends(require_roles("owner", "manager"))],
)
async def reopen_tab(
    tab_id: UUID,
    body: TabReopenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    try:
        tab, changed = await tab_service.reopen_tab(
            db,
            business_id=business.id,
            tab_id=tab_id,
            actor_id=current_user.id,
            request=body,
        )
    except tab_service.TabCommandError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found")
    await db.commit()
    if changed:
        await publish(DomainEvent(
            event_type="tab.reopened",
            business_id=str(business.id),
            payload={"tab_id": str(tab.id), "seating_id": str(tab.seating_id)},
        ))
    return await _tab_response(db, tab)


@ws_router.websocket("/ws/tabs/{business_id}")
async def tabs_websocket(
    business_id: UUID,
    ws: WebSocket,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    if not await authorize_staff_websocket(
        db,
        ws,
        token=token,
        business_id=business_id,
        required_modules=("ordering",),
    ):
        return
    bid = str(business_id)
    await tab_ws_manager.connect(bid, ws)
    try:
        await ws.send_json({"type": "tabs_invalidated"})
        async for _ in ws.iter_text():
            pass
    except WebSocketDisconnect:
        pass
    finally:
        tab_ws_manager.disconnect(bid, ws)
