import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import DomainEvent, publish
from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_module, require_roles
from app.models.business import Business
from app.models.user import User
from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryDiscrepancyResponse,
    InventoryItemResponse,
    InventoryItemUpdate,
    InventoryPackConversionCreate,
    InventoryPackConversionResponse,
    TransferReceiveLine,
    CountReconcileLine,
    StockMovementCreate,
    StockMovementResponse,
)
from app.services import inventory_service
from app.services import cost_control_service
from app.services import inventory_operations_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["inventory"])

_MODULE = "inventory"


# ─── Items ────────────────────────────────────────────────────────────────────

@router.get(
    "/api/inventory/{business_id}/items",
    response_model=list[InventoryItemResponse],
    dependencies=[Depends(require_module(_MODULE))],
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
    dependencies=[Depends(require_module(_MODULE))],
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
    dependencies=[Depends(require_module(_MODULE))],
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
    dependencies=[Depends(require_module(_MODULE))],
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
    dependencies=[Depends(require_module(_MODULE))],
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
    dependencies=[Depends(require_module(_MODULE)), Depends(require_roles("owner", "manager"))],
)
async def get_cost_control(business_id: UUID, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business)):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return {
        "valuation": await cost_control_service.inventory_valuation(db, business_id),
        "reorder_suggestions": await cost_control_service.reorder_suggestions(db, business_id),
        "disclosure": "Operational cost estimates derived from stock movements; not accounting or fiscal records.",
    }

@router.post("/api/inventory/{business_id}/transfers/{transfer_id}/dispatch", dependencies=[Depends(require_module(_MODULE)), Depends(require_roles("owner", "manager"))])
async def dispatch_transfer(business_id: UUID, transfer_id: UUID, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), current_user: User = Depends(get_current_user)):
    if business.id != business_id: raise HTTPException(status_code=403, detail="Forbidden")
    try:
        transfer = await inventory_operations_service.dispatch_transfer(db, business_id, transfer_id, current_user.id); await db.commit()
        await publish(DomainEvent(event_type="inventory.transfer_dispatched", business_id=str(business_id), payload={"transfer_id": str(transfer.id)})); return {"id": str(transfer.id), "status": transfer.status}
    except ValueError as exc:
        await db.rollback(); raise HTTPException(status_code=422, detail=str(exc)) from exc

@router.post("/api/inventory/{business_id}/transfers/{transfer_id}/receive", dependencies=[Depends(require_module(_MODULE)), Depends(require_roles("owner", "manager"))])
async def receive_transfer(business_id: UUID, transfer_id: UUID, body: list[TransferReceiveLine], db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), current_user: User = Depends(get_current_user)):
    if business.id != business_id: raise HTTPException(status_code=403, detail="Forbidden")
    try:
        await inventory_operations_service.apply_transfer_receipt_lines(db, business_id, transfer_id, body)
        transfer = await inventory_operations_service.receive_transfer(db, business_id, transfer_id, current_user.id); await db.commit()
        await publish(DomainEvent(event_type="inventory.transfer_reconciled", business_id=str(business_id), payload={"transfer_id": str(transfer.id)})); return {"id": str(transfer.id), "status": transfer.status}
    except ValueError as exc:
        await db.rollback(); raise HTTPException(status_code=422, detail=str(exc)) from exc

@router.post("/api/inventory/{business_id}/counts/{session_id}/reconcile", dependencies=[Depends(require_module(_MODULE)), Depends(require_roles("owner", "manager"))])
async def reconcile_count(business_id: UUID, session_id: UUID, body: list[CountReconcileLine], db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), current_user: User = Depends(get_current_user)):
    if business.id != business_id: raise HTTPException(status_code=403, detail="Forbidden")
    try:
        await inventory_operations_service.apply_count_lines(db, business_id, session_id, body)
        session = await inventory_operations_service.reconcile_count(db, business_id, session_id, current_user.id); await db.commit()
        await publish(DomainEvent(event_type="inventory.count_reconciled", business_id=str(business_id), payload={"count_session_id": str(session.id)})); return {"id": str(session.id), "status": session.status}
    except ValueError as exc:
        await db.rollback(); raise HTTPException(status_code=422, detail=str(exc)) from exc

@router.get(
    "/api/inventory/{business_id}/items/{item_id}/packs",
    response_model=list[InventoryPackConversionResponse],
    dependencies=[Depends(require_module(_MODULE))],
)
async def list_packs(business_id: UUID, item_id: UUID, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business)):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await inventory_service.list_pack_conversions(db, item_id, business_id)


@router.post(
    "/api/inventory/{business_id}/items/{item_id}/packs",
    response_model=InventoryPackConversionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module(_MODULE)), Depends(require_roles("owner", "manager"))],
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
    dependencies=[Depends(require_module(_MODULE))],
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
    dependencies=[Depends(require_module(_MODULE))],
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
    dependencies=[Depends(require_module(_MODULE))],
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
