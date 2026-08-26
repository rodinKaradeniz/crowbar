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
from app.schemas.purchasing import (
    PurchaseOrderAttachmentResponse,
    PurchaseOrderCreate,
    PurchaseOrderResponse,
    PurchaseOrderStatusUpdate,
    PurchasePriceHistoryEntry,
    PurchaseReceiptCreate,
    PurchaseReceiptResponse,
    SupplierCreate,
    SupplierProductCreate,
    SupplierProductResponse,
    SupplierProductUpdate,
    SupplierResponse,
    SupplierUpdate,
)
from app.services import purchasing_service

# Purchasing is a feature of the inventory module, not a module of its own.
router = APIRouter(
    prefix="/api/purchasing",
    tags=["purchasing"],
    dependencies=[Depends(require_module("inventory"))],
)

_ERROR_STATUS = {
    "NOT_FOUND": status.HTTP_404_NOT_FOUND,
    "CONFLICT": status.HTTP_409_CONFLICT,
    "IDEMPOTENCY_CONFLICT": status.HTTP_409_CONFLICT,
}


def _purchasing_error(exc: purchasing_service.PurchasingError) -> HTTPException:
    """Map a domain error to a status code.

    Only `PurchasingError` reaches this. Catching bare `Exception` here would
    turn integrity violations and genuine bugs into 422s carrying raw SQL.
    """
    return HTTPException(
        status_code=_ERROR_STATUS.get(exc.code, status.HTTP_422_UNPROCESSABLE_ENTITY),
        detail=str(exc),
    )


def _require_tenant(business: Business, business_id: UUID) -> None:
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


# ─── Suppliers ────────────────────────────────────────────────────────────────

@router.get("/{business_id}/suppliers", response_model=list[SupplierResponse],
    dependencies=[Depends(require_capability("purchasing.view"))],
)
async def list_suppliers(
    business_id: UUID,
    include_archived: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    return await purchasing_service.list_suppliers(
        db, business_id, include_archived=include_archived
    )


@router.post(
    "/{business_id}/suppliers",
    response_model=SupplierResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability("purchasing.suppliers.manage"))],
)
async def create_supplier(
    business_id: UUID,
    body: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    try:
        supplier = await purchasing_service.create_supplier(db, business_id, body)
        await db.commit()
        return supplier
    except purchasing_service.PurchasingError as exc:
        await db.rollback()
        raise _purchasing_error(exc) from exc


@router.patch(
    "/{business_id}/suppliers/{supplier_id}",
    response_model=SupplierResponse,
    dependencies=[Depends(require_capability("purchasing.suppliers.manage"))],
)
async def update_supplier(
    business_id: UUID,
    supplier_id: UUID,
    body: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    try:
        supplier = await purchasing_service.update_supplier(db, business_id, supplier_id, body)
        await db.commit()
        return supplier
    except purchasing_service.PurchasingError as exc:
        await db.rollback()
        raise _purchasing_error(exc) from exc


@router.post(
    "/{business_id}/suppliers/{supplier_id}/archive",
    response_model=SupplierResponse,
    dependencies=[Depends(require_capability("purchasing.suppliers.manage"))],
)
async def archive_supplier(
    business_id: UUID,
    supplier_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    try:
        supplier = await purchasing_service.archive_supplier(db, business_id, supplier_id)
        await db.commit()
        return supplier
    except purchasing_service.PurchasingError as exc:
        await db.rollback()
        raise _purchasing_error(exc) from exc


# ─── Supplier products ────────────────────────────────────────────────────────

@router.get("/{business_id}/supplier-products", response_model=list[SupplierProductResponse],
    dependencies=[Depends(require_capability("purchasing.view"))],
)
async def list_supplier_products(
    business_id: UUID,
    supplier_id: UUID | None = Query(default=None),
    include_archived: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    return await purchasing_service.list_supplier_products(
        db, business_id, supplier_id=supplier_id, include_archived=include_archived
    )


@router.post(
    "/{business_id}/suppliers/{supplier_id}/products",
    response_model=SupplierProductResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability("purchasing.suppliers.manage"))],
)
async def create_supplier_product(
    business_id: UUID,
    supplier_id: UUID,
    body: SupplierProductCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    try:
        product = await purchasing_service.create_supplier_product(
            db, business, supplier_id, body
        )
        await db.commit()
        return product
    except purchasing_service.PurchasingError as exc:
        await db.rollback()
        raise _purchasing_error(exc) from exc


@router.patch(
    "/{business_id}/supplier-products/{supplier_product_id}",
    response_model=SupplierProductResponse,
    dependencies=[Depends(require_capability("purchasing.suppliers.manage"))],
)
async def update_supplier_product(
    business_id: UUID,
    supplier_product_id: UUID,
    body: SupplierProductUpdate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    try:
        product = await purchasing_service.update_supplier_product(
            db, business_id, supplier_product_id, body
        )
        await db.commit()
        return product
    except purchasing_service.PurchasingError as exc:
        await db.rollback()
        raise _purchasing_error(exc) from exc


@router.post(
    "/{business_id}/supplier-products/{supplier_product_id}/archive",
    response_model=SupplierProductResponse,
    dependencies=[Depends(require_capability("purchasing.suppliers.manage"))],
)
async def archive_supplier_product(
    business_id: UUID,
    supplier_product_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    try:
        product = await purchasing_service.archive_supplier_product(
            db, business_id, supplier_product_id
        )
        await db.commit()
        return product
    except purchasing_service.PurchasingError as exc:
        await db.rollback()
        raise _purchasing_error(exc) from exc


# ─── Purchase orders ──────────────────────────────────────────────────────────

@router.get("/{business_id}/purchase-orders", response_model=list[PurchaseOrderResponse],
    dependencies=[Depends(require_capability("purchasing.view"))],
)
async def list_purchase_orders(
    business_id: UUID,
    order_status: str | None = Query(
        default=None,
        pattern="^(draft|approved|ordered|partially_received|received|closed_short|cancelled)$",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    return await purchasing_service.list_purchase_orders(
        db, business_id, status=order_status, limit=limit, offset=offset
    )


@router.post(
    "/{business_id}/purchase-orders",
    response_model=PurchaseOrderResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability("purchasing.order.create"))],
)
async def create_purchase_order(
    business_id: UUID,
    body: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    _require_tenant(business, business_id)
    try:
        po = await purchasing_service.create_purchase_order(db, business, current_user.id, body)
        response = await purchasing_service.purchase_order_response(db, po)
        await db.commit()
    except purchasing_service.PurchasingError as exc:
        await db.rollback()
        raise _purchasing_error(exc) from exc
    await publish(
        DomainEvent(
            event_type="purchasing.purchase_order_created",
            business_id=str(business_id),
            payload={"purchase_order_id": str(po.id)},
        )
    )
    return response


@router.post(
    "/{business_id}/purchase-orders/{purchase_order_id}/status",
    response_model=PurchaseOrderResponse,
    dependencies=[Depends(require_capability("purchasing.order.approve"))],
)
async def update_purchase_order_status(
    business_id: UUID,
    purchase_order_id: UUID,
    body: PurchaseOrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    _require_tenant(business, business_id)
    try:
        po = await purchasing_service.transition_purchase_order(
            db,
            business_id,
            purchase_order_id,
            current_user.id,
            body.status,
            closure_reason=body.closure_reason,
        )
        response = await purchasing_service.purchase_order_response(db, po)
        await db.commit()
    except purchasing_service.PurchasingError as exc:
        await db.rollback()
        raise _purchasing_error(exc) from exc
    await publish(
        DomainEvent(
            event_type="purchasing.purchase_order_updated",
            business_id=str(business_id),
            payload={"purchase_order_id": str(po.id), "status": po.status},
        )
    )
    return response


@router.post(
    "/{business_id}/purchase-orders/{purchase_order_id}/receipts",
    response_model=PurchaseReceiptResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability("purchasing.receive"))],
)
async def receive_purchase_order(
    business_id: UUID,
    purchase_order_id: UUID,
    body: PurchaseReceiptCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    _require_tenant(business, business_id)
    try:
        receipt, created = await purchasing_service.receive_purchase_order(
            db, business, purchase_order_id, current_user.id, body
        )
        response = await purchasing_service.receipt_response(db, receipt)
        await db.commit()
    except purchasing_service.PurchasingError as exc:
        await db.rollback()
        raise _purchasing_error(exc) from exc
    # A replayed receipt changed nothing, so it publishes nothing.
    if created:
        await publish(
            DomainEvent(
                event_type="inventory.purchase_received",
                business_id=str(business_id),
                payload={
                    "purchase_order_id": str(purchase_order_id),
                    "receipt_id": str(receipt.id),
                },
            )
        )
    return response


@router.get(
    "/{business_id}/items/{item_id}/price-history",
    response_model=list[PurchasePriceHistoryEntry],
    dependencies=[Depends(require_capability("purchasing.view"))],
)
async def item_price_history(
    business_id: UUID,
    item_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    return await purchasing_service.price_history(db, business_id, item_id, limit=limit)


# ─── Attachments ──────────────────────────────────────────────────────────────

@router.post(
    "/{business_id}/purchase-orders/{purchase_order_id}/attachments",
    response_model=PurchaseOrderAttachmentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability("purchasing.receive"))],
)
async def add_attachment(
    business_id: UUID,
    purchase_order_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    _require_tenant(business, business_id)
    data = await file.read()
    try:
        attachment = await purchasing_service.add_attachment(
            db,
            business_id,
            purchase_order_id,
            current_user.id,
            filename=file.filename or "attachment",
            content_type=file.content_type,
            data=data,
        )
        await db.commit()
        return attachment
    except purchasing_service.PurchasingError as exc:
        await db.rollback()
        raise _purchasing_error(exc) from exc


@router.get(
    "/{business_id}/purchase-orders/{purchase_order_id}/attachments",
    response_model=list[PurchaseOrderAttachmentResponse],
    dependencies=[Depends(require_capability("purchasing.view"))],
)
async def list_attachments(
    business_id: UUID,
    purchase_order_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    try:
        return await purchasing_service.list_attachments(db, business_id, purchase_order_id)
    except purchasing_service.PurchasingError as exc:
        raise _purchasing_error(exc) from exc


@router.get("/{business_id}/purchase-orders/{purchase_order_id}/attachments/{attachment_id}/content",
    dependencies=[Depends(require_capability("purchasing.view"))],
)
async def download_attachment(
    business_id: UUID,
    purchase_order_id: UUID,
    attachment_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    """Stream an attachment through the authenticated API.

    Deliberately not served from the public `/uploads` mount: a supplier invoice
    is tenant data and must not be readable by anyone holding the URL.
    """
    _require_tenant(business, business_id)
    try:
        attachment, data = await purchasing_service.read_attachment(
            db, business_id, purchase_order_id, attachment_id
        )
    except purchasing_service.PurchasingError as exc:
        raise _purchasing_error(exc) from exc
    return Response(
        content=data,
        media_type=attachment.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{attachment.filename}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.delete(
    "/{business_id}/purchase-orders/{purchase_order_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_capability("purchasing.receive"))],
)
async def delete_attachment(
    business_id: UUID,
    purchase_order_id: UUID,
    attachment_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    _require_tenant(business, business_id)
    try:
        await purchasing_service.delete_attachment(
            db, business_id, purchase_order_id, attachment_id
        )
        await db.commit()
    except purchasing_service.PurchasingError as exc:
        await db.rollback()
        raise _purchasing_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
