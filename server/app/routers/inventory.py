import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import DomainEvent, publish
from app.database import get_db
from app.dependencies import (
    get_current_business,
    get_current_user,
    require_capability,
    require_module,
)
from app.models.business import Business
from app.models.user import User
from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryDiscrepancyResponse,
    InventoryItemResponse,
    InventoryItemUpdate,
    InventoryPackConversionCreate,
    InventoryPackConversionResponse,
    CountLineUpdate,
    CountSessionCreate,
    CountSessionResponse,
    CountSessionSummary,
    StockMovementCreate,
    StockMovementResponse,
)
from app.services import inventory_service
from app.services import cost_control_service
from app.services import inventory_operations_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["inventory"])

_MODULE = "inventory"

_COUNT_ERROR_STATUS = {
    "NOT_FOUND": status.HTTP_404_NOT_FOUND,
    "CONFLICT": status.HTTP_409_CONFLICT,
}


def _count_error(exc: "inventory_operations_service.CountSessionError") -> HTTPException:
    return HTTPException(
        status_code=_COUNT_ERROR_STATUS.get(exc.code, status.HTTP_422_UNPROCESSABLE_ENTITY),
        detail=str(exc),
    )


# ─── Items ────────────────────────────────────────────────────────────────────

@router.get(
    "/api/inventory/{business_id}/items",
    response_model=list[InventoryItemResponse],
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.view"))],
)
async def list_items(
    business_id: UUID,
    location_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await inventory_service.list_items(db, business_id, location_id=location_id)


@router.post(
    "/api/inventory/{business_id}/items",
    response_model=InventoryItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.items.manage"))],
)
async def create_item(
    business_id: UUID,
    body: InventoryItemCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    item = await inventory_service.create_item(db, business_id, body)
    await db.commit()
    return item


@router.patch(
    "/api/inventory/{business_id}/items/{item_id}",
    response_model=InventoryItemResponse,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.items.manage"))],
)
async def update_item(
    business_id: UUID,
    item_id: UUID,
    body: InventoryItemUpdate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        item = await inventory_service.update_item(db, item_id, business_id, body)
    except inventory_service.UnitTypeChangeBlocked as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.commit()
    return item


@router.delete(
    "/api/inventory/{business_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.items.manage"))],
)
async def delete_item(
    business_id: UUID,
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    deleted = await inventory_service.delete_item(db, item_id, business_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/api/inventory/{business_id}/discrepancies",
    response_model=list[InventoryDiscrepancyResponse],
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.view"))],
)
async def list_discrepancies(
    business_id: UUID,
    discrepancy_status: str = Query(default="open", pattern="^(open|resolved)$"),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await inventory_service.list_discrepancies(
        db, business_id, status=discrepancy_status
    )


# ─── Low-stock ────────────────────────────────────────────────────────────────

@router.get(
    "/api/inventory/{business_id}/cost-control",
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.cost.view"))],
)
async def get_cost_control(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return {
        "valuation": await cost_control_service.inventory_valuation(
            db, business_id, business.currency_code
        ),
        "reorder_suggestions": await cost_control_service.reorder_suggestions(db, business_id),
        "disclosure": cost_control_service.DISCLOSURE,
    }


@router.get(
    "/api/inventory/{business_id}/cost-control/margins",
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.cost.view"))],
)
async def get_menu_margins(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    margins = await cost_control_service.menu_margins(db, business_id, business.currency_code)
    return {**margins, "disclosure": cost_control_service.DISCLOSURE}


@router.get(
    "/api/inventory/{business_id}/cost-control/recipe-cost/{menu_item_id}",
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.cost.view"))],
)
async def get_recipe_cost(
    business_id: UUID,
    menu_item_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        detail = await cost_control_service.recipe_cost(db, business_id, menu_item_id)
    except cost_control_service.CostControlError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND
            if exc.code == "NOT_FOUND"
            else status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return {**detail, "disclosure": cost_control_service.DISCLOSURE}


@router.get(
    "/api/inventory/{business_id}/cost-control/variance",
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.cost.view"))],
)
async def get_consumption_variance(
    business_id: UUID,
    start: datetime = Query(...),
    end: datetime = Query(...),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if end <= start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The end of the range must be after its start",
        )
    variance = await cost_control_service.consumption_variance(
        db, business_id, business.currency_code, start=start, end=end
    )
    return {**variance, "disclosure": cost_control_service.DISCLOSURE}


@router.get(
    "/api/inventory/{business_id}/cost-control/cogs",
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.cost.view"))],
)
async def get_controllable_cogs(
    business_id: UUID,
    start: datetime = Query(...),
    end: datetime = Query(...),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if end <= start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The end of the range must be after its start",
        )
    cogs = await cost_control_service.controllable_cogs(
        db, business_id, business.currency_code, start=start, end=end
    )
    return {**cogs, "disclosure": cost_control_service.DISCLOSURE}


# ─── Count sessions ───────────────────────────────────────────────────────────

@router.post(
    "/api/inventory/{business_id}/counts",
    response_model=CountSessionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.counts.manage"))],
)
async def create_count_session(
    business_id: UUID,
    body: CountSessionCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        session = await inventory_operations_service.create_count_session(
            db, business_id, current_user.id, body
        )
        payload = await inventory_operations_service.count_session_response(
            db, business_id, session
        )
        await db.commit()
        return payload
    except inventory_operations_service.CountSessionError as exc:
        await db.rollback()
        raise _count_error(exc) from exc


@router.get(
    "/api/inventory/{business_id}/counts",
    response_model=list[CountSessionSummary],
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.view"))],
)
async def list_count_sessions(
    business_id: UUID,
    session_status: str | None = Query(default=None, pattern="^(open|reconciled|cancelled)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await inventory_operations_service.list_count_sessions(
        db, business_id, status=session_status, limit=limit, offset=offset
    )


@router.get(
    "/api/inventory/{business_id}/counts/{session_id}",
    response_model=CountSessionResponse,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.view"))],
)
async def get_count_session(
    business_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        return await inventory_operations_service.get_count_session(db, business_id, session_id)
    except inventory_operations_service.CountSessionError as exc:
        raise _count_error(exc) from exc


@router.patch(
    "/api/inventory/{business_id}/counts/{session_id}/lines",
    response_model=CountSessionResponse,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.counts.walk"))],
)
async def save_count_lines(
    business_id: UUID,
    session_id: UUID,
    body: list[CountLineUpdate],
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        session = await inventory_operations_service.apply_count_lines(
            db, business_id, session_id, body
        )
        payload = await inventory_operations_service.count_session_response(
            db, business_id, session
        )
        await db.commit()
        return payload
    except inventory_operations_service.CountSessionError as exc:
        await db.rollback()
        raise _count_error(exc) from exc


@router.post(
    "/api/inventory/{business_id}/counts/{session_id}/cancel",
    response_model=CountSessionSummary,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.counts.manage"))],
)
async def cancel_count_session(
    business_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        session = await inventory_operations_service.cancel_count_session(
            db, business_id, session_id
        )
        await db.commit()
        return session
    except inventory_operations_service.CountSessionError as exc:
        await db.rollback()
        raise _count_error(exc) from exc


@router.post(
    "/api/inventory/{business_id}/counts/{session_id}/reconcile",
    response_model=CountSessionResponse,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.counts.manage"))],
)
async def reconcile_count_session(
    business_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        session = await inventory_operations_service.reconcile_count(
            db, business_id, session_id, current_user.id
        )
        payload = await inventory_operations_service.count_session_response(
            db, business_id, session
        )
        await db.commit()
    except inventory_operations_service.CountSessionError as exc:
        await db.rollback()
        raise _count_error(exc) from exc
    await publish(
        DomainEvent(
            event_type="inventory.count_reconciled",
            business_id=str(business_id),
            payload={"count_session_id": str(session.id)},
        )
    )
    return payload


@router.get(
    "/api/inventory/{business_id}/counts/{session_id}/sheet",
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.counts.walk"))],
)
async def export_count_sheet(
    business_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    """Download an open count as a CSV the operator can walk the stockroom with."""
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        content = await inventory_operations_service.export_count_sheet(
            db, business_id, session_id
        )
    except inventory_operations_service.CountSessionError as exc:
        raise _count_error(exc) from exc
    return Response(
        content=content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="count-{session_id}.csv"',
            "Cache-Control": "private, no-store",
        },
    )


@router.post(
    "/api/inventory/{business_id}/counts/{session_id}/sheet",
    response_model=CountSessionResponse,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.counts.walk"))],
)
async def import_count_sheet(
    business_id: UUID,
    session_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    raw = await file.read()
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The count sheet must be UTF-8 text",
        ) from exc
    try:
        session = await inventory_operations_service.import_count_sheet(
            db, business_id, session_id, content
        )
        payload = await inventory_operations_service.count_session_response(
            db, business_id, session
        )
        await db.commit()
        return payload
    except inventory_operations_service.CountSessionError as exc:
        await db.rollback()
        raise _count_error(exc) from exc


@router.get(
    "/api/inventory/{business_id}/items/{item_id}/packs",
    response_model=list[InventoryPackConversionResponse],
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.view"))],
)
async def list_packs(business_id: UUID, item_id: UUID, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business)):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await inventory_service.list_pack_conversions(db, item_id, business_id)


@router.post(
    "/api/inventory/{business_id}/items/{item_id}/packs",
    response_model=InventoryPackConversionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.items.manage"))],
)
async def create_pack(business_id: UUID, item_id: UUID, body: InventoryPackConversionCreate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business)):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        pack = await inventory_service.create_pack_conversion(db, item_id, business_id, **body.model_dump())
        await db.commit()
        return pack
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

@router.get(
    "/api/inventory/{business_id}/low-stock",
    response_model=list[InventoryItemResponse],
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.view"))],
)
async def get_low_stock(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await inventory_service.get_low_stock_items(db, business_id)


# ─── Stock Movements ──────────────────────────────────────────────────────────

@router.post(
    "/api/inventory/{business_id}/items/{item_id}/movements",
    response_model=StockMovementResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.movements"))],
)
async def record_movement(
    business_id: UUID,
    item_id: UUID,
    body: StockMovementCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        movement = await inventory_service.record_movement(
            db, item_id, business_id, body, created_by_id=current_user.id
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    await db.commit()
    await publish(DomainEvent(
        event_type="inventory.movement_recorded",
        business_id=str(business_id),
        payload={
            "item_id": str(item_id),
            "movement_type": body.movement_type,
            "alert_triggered": movement.alert_triggered,
        },
    ))
    return movement


@router.get(
    "/api/inventory/{business_id}/items/{item_id}/movements",
    response_model=list[StockMovementResponse],
    dependencies=[Depends(require_module(_MODULE)), Depends(require_capability("inventory.view"))],
)
async def list_movements(
    business_id: UUID,
    item_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await inventory_service.list_movements(
        db, item_id, business_id, limit=limit, offset=offset
    )
