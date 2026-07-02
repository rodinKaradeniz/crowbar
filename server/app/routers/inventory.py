import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import DomainEvent, publish
from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_module
from app.models.business import Business
from app.models.user import User
from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemUpdate,
    StockMovementCreate,
    StockMovementResponse,
)
from app.services import inventory_service

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
    item = await inventory_service.update_item(db, item_id, business_id, body)
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


# ─── Low-stock ────────────────────────────────────────────────────────────────

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
