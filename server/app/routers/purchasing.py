from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import DomainEvent, publish
from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_module, require_roles
from app.models.business import Business
from app.models.purchasing import PurchaseOrder
from app.models.user import User
from app.schemas.purchasing import (PurchaseOrderCreate, PurchaseOrderResponse, PurchaseOrderStatusUpdate, PurchaseReceiptCreate, PurchaseReceiptResponse, SupplierCreate, SupplierResponse)
from app.services import purchasing_service


router = APIRouter(prefix="/api/purchasing", tags=["purchasing"], dependencies=[Depends(require_module("inventory"))])


def _forbidden_or_not_found(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get("/{business_id}/suppliers", response_model=list[SupplierResponse])
async def list_suppliers(business_id: UUID, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business)):
    if business.id != business_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return await purchasing_service.list_suppliers(db, business_id)


@router.post("/{business_id}/suppliers", response_model=SupplierResponse, status_code=201, dependencies=[Depends(require_roles("owner", "manager"))])
async def create_supplier(business_id: UUID, body: SupplierCreate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business)):
    if business.id != business_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        supplier = await purchasing_service.create_supplier(db, business_id, body)
        await db.commit()
        return supplier
    except Exception as exc:
        await db.rollback()
        raise _forbidden_or_not_found(exc) from exc


@router.get("/{business_id}/purchase-orders", response_model=list[PurchaseOrderResponse])
async def list_purchase_orders(business_id: UUID, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business)):
    if business.id != business_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    rows = await db.scalars(select(PurchaseOrder).where(PurchaseOrder.business_id == business_id).order_by(PurchaseOrder.updated_at.desc()))
    return [await purchasing_service.purchase_order_response(db, po) for po in rows]


@router.post("/{business_id}/purchase-orders", response_model=PurchaseOrderResponse, status_code=201, dependencies=[Depends(require_roles("owner", "manager"))])
async def create_purchase_order(business_id: UUID, body: PurchaseOrderCreate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), current_user: User = Depends(get_current_user)):
    if business.id != business_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        po = await purchasing_service.create_purchase_order(db, business, current_user.id, body)
        response = await purchasing_service.purchase_order_response(db, po)
        await db.commit()
        await publish(DomainEvent(event_type="purchasing.purchase_order_created", business_id=str(business_id), payload={"purchase_order_id": str(po.id)}))
        return response
    except Exception as exc:
        await db.rollback()
        raise _forbidden_or_not_found(exc) from exc


@router.post("/{business_id}/purchase-orders/{purchase_order_id}/status", response_model=PurchaseOrderResponse, dependencies=[Depends(require_roles("owner", "manager"))])
async def update_purchase_order_status(business_id: UUID, purchase_order_id: UUID, body: PurchaseOrderStatusUpdate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), current_user: User = Depends(get_current_user)):
    if business.id != business_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        po = await purchasing_service.transition_purchase_order(db, business_id, purchase_order_id, current_user.id, body.status)
        response = await purchasing_service.purchase_order_response(db, po)
        await db.commit()
        await publish(DomainEvent(event_type="purchasing.purchase_order_updated", business_id=str(business_id), payload={"purchase_order_id": str(po.id), "status": po.status}))
        return response
    except Exception as exc:
        await db.rollback()
        raise _forbidden_or_not_found(exc) from exc


@router.post("/{business_id}/purchase-orders/{purchase_order_id}/receipts", response_model=PurchaseReceiptResponse, status_code=201, dependencies=[Depends(require_roles("owner", "manager"))])
async def receive_purchase_order(business_id: UUID, purchase_order_id: UUID, body: PurchaseReceiptCreate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), current_user: User = Depends(get_current_user)):
    if business.id != business_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        receipt = await purchasing_service.receive_purchase_order(db, business, purchase_order_id, current_user.id, body)
        await db.commit()
        await publish(DomainEvent(event_type="inventory.purchase_received", business_id=str(business_id), payload={"purchase_order_id": str(purchase_order_id), "receipt_id": str(receipt.id)}))
        return receipt
    except Exception as exc:
        await db.rollback()
        raise _forbidden_or_not_found(exc) from exc
