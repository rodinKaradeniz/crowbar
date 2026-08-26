"""Supplier, purchase order and receiving domain logic.

Crowbar does not pay supplier invoices. Purchasing ends at reference capture and
stock reconciliation, so nothing here produces a payment, tender or fiscal record.

Unit discipline runs through the whole file: order and receipt lines count PACKS
and price per pack, while the stock ledger and `purchase_price_history` are per
canonical base unit. Every conversion goes through a pack conversion's
`base_quantity`, and every balance change goes through
`inventory_service.apply_movement`.
"""
import hashlib
import json
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.inventory import InventoryItem, InventoryPackConversion
from app.models.purchasing import (
    PurchaseOrder,
    PurchaseOrderAttachment,
    PurchaseOrderLine,
    PurchasePriceHistory,
    PurchaseReceipt,
    PurchaseReceiptLine,
    Supplier,
    SupplierProduct,
)
from app.schemas.purchasing import (
    PurchaseOrderCreate,
    PurchaseReceiptCreate,
    SupplierCreate,
    SupplierProductCreate,
    SupplierProductUpdate,
    SupplierUpdate,
)
from app.services import inventory_service, notification_service
from app.services.storage_service import generate_upload_path, get_storage_service

# Per-base-unit costs are deliberately NOT quantized at the currency minor unit.
# A 700 ml bottle at 38.00 EUR is 0.054286 EUR/ml; rounding that to cents would
# make it 0.05 and understate consumption cost by roughly eight percent. Six
# decimal places is the storage scale of the column, so quantizing here makes the
# truncation deterministic instead of driver-dependent.
COST_QUANTUM = Decimal("0.000001")

# Terminal states are explicit. `received` and `cancelled` end an order, and
# `closed_short` ends one the supplier will not complete without claiming that
# nothing arrived. Receiving moves an order into `partially_received` or
# `received` directly; those are recomputed from line quantities, not requested.
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"approved", "cancelled"},
    "approved": {"ordered", "cancelled"},
    "ordered": {"cancelled"},
    "partially_received": {"received", "closed_short"},
    "received": set(),
    "closed_short": set(),
    "cancelled": set(),
}

_OPEN_ORDER_STATUSES = ("approved", "ordered", "partially_received")


class PurchasingError(ValueError):
    def __init__(self, message: str, *, code: str = "VALIDATION_ERROR"):
        self.code = code
        super().__init__(message)


def receipt_fingerprint(data: PurchaseReceiptCreate) -> str:
    """Stable hash of a receipt request, so a replayed key with a different body is refused."""
    payload = json.dumps(
        {
            "delivery_reference": data.delivery_reference,
            "invoice_reference": data.invoice_reference,
            "lines": sorted(
                [
                    [
                        str(line.purchase_order_line_id),
                        str(line.received_quantity),
                        str(line.unit_price),
                    ]
                    for line in data.lines
                ]
            ),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


# ─── Suppliers ────────────────────────────────────────────────────────────────

async def _supplier(
    db: AsyncSession,
    business_id: UUID,
    supplier_id: UUID,
    *,
    active_only: bool = False,
) -> Supplier:
    stmt = select(Supplier).where(
        Supplier.id == supplier_id,
        Supplier.business_id == business_id,
    )
    if active_only:
        stmt = stmt.where(Supplier.is_active.is_(True))
    supplier = await db.scalar(stmt)
    if supplier is None:
        raise PurchasingError("Supplier not found", code="NOT_FOUND")
    return supplier


async def create_supplier(db: AsyncSession, business_id: UUID, data: SupplierCreate) -> Supplier:
    supplier = Supplier(business_id=business_id, **data.model_dump())
    db.add(supplier)
    await db.flush()
    return supplier


async def list_suppliers(
    db: AsyncSession,
    business_id: UUID,
    *,
    include_archived: bool = False,
) -> list[Supplier]:
    stmt = select(Supplier).where(Supplier.business_id == business_id)
    if not include_archived:
        stmt = stmt.where(Supplier.is_active.is_(True))
    return list((await db.scalars(stmt.order_by(Supplier.name))).all())


async def update_supplier(
    db: AsyncSession,
    business_id: UUID,
    supplier_id: UUID,
    data: SupplierUpdate,
) -> Supplier:
    supplier = await _supplier(db, business_id, supplier_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(supplier, field, value)
    await db.flush()
    return supplier


async def archive_supplier(db: AsyncSession, business_id: UUID, supplier_id: UUID) -> Supplier:
    """Archive rather than delete: purchase history references the supplier row."""
    supplier = await _supplier(db, business_id, supplier_id)
    open_order = await db.scalar(
        select(PurchaseOrder.id).where(
            PurchaseOrder.business_id == business_id,
            PurchaseOrder.supplier_id == supplier_id,
            PurchaseOrder.status.in_(_OPEN_ORDER_STATUSES),
        )
    )
    if open_order is not None:
        raise PurchasingError(
            "Close or cancel this supplier's open purchase orders before archiving them",
            code="CONFLICT",
        )
    supplier.is_active = False
    await db.flush()
    return supplier


# ─── Supplier products ────────────────────────────────────────────────────────

async def create_supplier_product(
    db: AsyncSession,
    business: Business,
    supplier_id: UUID,
    data: SupplierProductCreate,
) -> SupplierProduct:
    supplier = await _supplier(db, business.id, supplier_id, active_only=True)
    item = await inventory_service.get_item(db, data.inventory_item_id, business.id)
    if item is None:
        raise PurchasingError("Supplier product needs an active tenant inventory item")
    if data.pack_conversion_id is not None:
        await _pack(db, business.id, data.pack_conversion_id, item.id)
    product = SupplierProduct(
        business_id=business.id,
        supplier_id=supplier.id,
        currency_code=business.currency_code,
        **data.model_dump(),
    )
    db.add(product)
    await db.flush()
    return product


async def list_supplier_products(
    db: AsyncSession,
    business_id: UUID,
    *,
    supplier_id: UUID | None = None,
    include_archived: bool = False,
) -> list[SupplierProduct]:
    stmt = select(SupplierProduct).where(SupplierProduct.business_id == business_id)
    if supplier_id is not None:
        stmt = stmt.where(SupplierProduct.supplier_id == supplier_id)
    if not include_archived:
        stmt = stmt.where(SupplierProduct.is_active.is_(True))
    return list((await db.scalars(stmt.order_by(SupplierProduct.product_name))).all())


async def _supplier_product(
    db: AsyncSession,
    business_id: UUID,
    supplier_product_id: UUID,
) -> SupplierProduct:
    product = await db.scalar(
        select(SupplierProduct).where(
            SupplierProduct.id == supplier_product_id,
            SupplierProduct.business_id == business_id,
        )
    )
    if product is None:
        raise PurchasingError("Supplier product not found", code="NOT_FOUND")
    return product


async def update_supplier_product(
    db: AsyncSession,
    business_id: UUID,
    supplier_product_id: UUID,
    data: SupplierProductUpdate,
) -> SupplierProduct:
    product = await _supplier_product(db, business_id, supplier_product_id)
    fields = data.model_dump(exclude_unset=True)
    if fields.get("pack_conversion_id") is not None:
        await _pack(db, business_id, fields["pack_conversion_id"], product.inventory_item_id)
    for field, value in fields.items():
        setattr(product, field, value)
    await db.flush()
    return product


async def archive_supplier_product(
    db: AsyncSession,
    business_id: UUID,
    supplier_product_id: UUID,
) -> SupplierProduct:
    product = await _supplier_product(db, business_id, supplier_product_id)
    product.is_active = False
    await db.flush()
    return product


# ─── Purchase orders ──────────────────────────────────────────────────────────

async def _pack(
    db: AsyncSession,
    business_id: UUID,
    pack_conversion_id: UUID,
    inventory_item_id: UUID,
) -> InventoryPackConversion:
    """Load a pack conversion, proving it belongs to both the tenant and the item.

    Checking the item as well as the tenant matters: the conversion's
    `base_quantity` is what turns packs into base units, so the wrong pack
    silently receives the wrong quantity of stock at the wrong cost.
    """
    pack = await db.scalar(
        select(InventoryPackConversion).where(
            InventoryPackConversion.id == pack_conversion_id,
            InventoryPackConversion.business_id == business_id,
            InventoryPackConversion.inventory_item_id == inventory_item_id,
        )
    )
    if pack is None:
        raise PurchasingError("Pack conversion does not belong to this inventory item")
    return pack


async def _po(
    db: AsyncSession,
    business_id: UUID,
    purchase_order_id: UUID,
    *,
    lock: bool = False,
) -> PurchaseOrder:
    stmt = select(PurchaseOrder).where(
        PurchaseOrder.id == purchase_order_id,
        PurchaseOrder.business_id == business_id,
    )
    if lock:
        stmt = stmt.with_for_update()
    po = await db.scalar(stmt)
    if po is None:
        raise PurchasingError("Purchase order not found", code="NOT_FOUND")
    return po


async def _lines(db: AsyncSession, business_id: UUID, po_id: UUID) -> list[PurchaseOrderLine]:
    return list(
        (
            await db.scalars(
                select(PurchaseOrderLine)
                .where(
                    PurchaseOrderLine.purchase_order_id == po_id,
                    PurchaseOrderLine.business_id == business_id,
                )
                .order_by(PurchaseOrderLine.created_at)
            )
        ).all()
    )


async def purchase_order_response(db: AsyncSession, po: PurchaseOrder) -> dict:
    return {
        "id": po.id,
        "business_id": po.business_id,
        "supplier_id": po.supplier_id,
        "location_id": po.location_id,
        "status": po.status,
        "reference": po.reference,
        "expected_on": po.expected_on,
        "note": po.note,
        "approved_by": po.approved_by,
        "approved_at": po.approved_at,
        "ordered_at": po.ordered_at,
        "closed_at": po.closed_at,
        "closed_by": po.closed_by,
        "closure_reason": po.closure_reason,
        "lines": await _lines(db, po.business_id, po.id),
    }


async def list_purchase_orders(
    db: AsyncSession,
    business_id: UUID,
    *,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    stmt = select(PurchaseOrder).where(PurchaseOrder.business_id == business_id)
    if status is not None:
        stmt = stmt.where(PurchaseOrder.status == status)
    orders = list(
        (
            await db.scalars(
                stmt.order_by(PurchaseOrder.updated_at.desc()).limit(limit).offset(offset)
            )
        ).all()
    )
    if not orders:
        return []
    # One query for every line on the page, rather than one query per order.
    rows = await db.scalars(
        select(PurchaseOrderLine)
        .where(
            PurchaseOrderLine.business_id == business_id,
            PurchaseOrderLine.purchase_order_id.in_([po.id for po in orders]),
        )
        .order_by(PurchaseOrderLine.created_at)
    )
    by_order: dict[UUID, list[PurchaseOrderLine]] = {po.id: [] for po in orders}
    for line in rows.all():
        by_order[line.purchase_order_id].append(line)
    return [
        {
            "id": po.id,
            "business_id": po.business_id,
            "supplier_id": po.supplier_id,
            "location_id": po.location_id,
            "status": po.status,
            "reference": po.reference,
            "expected_on": po.expected_on,
            "note": po.note,
            "approved_by": po.approved_by,
            "approved_at": po.approved_at,
            "ordered_at": po.ordered_at,
            "closed_at": po.closed_at,
            "closed_by": po.closed_by,
            "closure_reason": po.closure_reason,
            "lines": by_order[po.id],
        }
        for po in orders
    ]


async def create_purchase_order(
    db: AsyncSession,
    business: Business,
    actor_id: UUID,
    data: PurchaseOrderCreate,
) -> PurchaseOrder:
    supplier = await _supplier(db, business.id, data.supplier_id, active_only=True)
    if data.location_id is not None:
        await inventory_service.validate_location(db, business.id, data.location_id)
    po = PurchaseOrder(
        business_id=business.id,
        supplier_id=supplier.id,
        location_id=data.location_id,
        reference=data.reference,
        expected_on=data.expected_on,
        note=data.note,
        created_by=actor_id,
    )
    db.add(po)
    await db.flush()

    seen: set[UUID] = set()
    for line in data.lines:
        if line.inventory_item_id in seen:
            raise PurchasingError("A purchase order cannot contain an inventory item twice")
        seen.add(line.inventory_item_id)
        item = await inventory_service.get_item(db, line.inventory_item_id, business.id)
        if item is None:
            raise PurchasingError("Each line needs an active tenant inventory item")
        pack = await _pack(db, business.id, line.pack_conversion_id, item.id)
        if line.supplier_product_id is not None:
            product = await _supplier_product(db, business.id, line.supplier_product_id)
            if product.supplier_id != supplier.id:
                raise PurchasingError("Line references a product from a different supplier")
        db.add(
            PurchaseOrderLine(
                business_id=business.id,
                purchase_order_id=po.id,
                inventory_item_id=item.id,
                supplier_product_id=line.supplier_product_id,
                description=line.description,
                ordered_quantity=line.ordered_quantity,
                pack_conversion_id=pack.id,
                unit_price=line.unit_price,
                currency_code=business.currency_code,
            )
        )
    await db.flush()
    return po


async def transition_purchase_order(
    db: AsyncSession,
    business_id: UUID,
    po_id: UUID,
    actor_id: UUID,
    status: str,
    *,
    closure_reason: str | None = None,
) -> PurchaseOrder:
    po = await _po(db, business_id, po_id, lock=True)
    if status not in _ALLOWED_TRANSITIONS.get(po.status, set()):
        raise PurchasingError(
            f"Cannot change a {po.status} purchase order to {status}",
            code="CONFLICT",
        )
    if status == "closed_short" and not closure_reason:
        raise PurchasingError("Closing an order short requires a reason")

    po.status = status
    now = datetime.now(timezone.utc)
    if status == "approved":
        po.approved_by = actor_id
        po.approved_at = now
    elif status == "ordered":
        po.ordered_at = now
    elif status in {"received", "closed_short", "cancelled"}:
        po.closed_by = actor_id
        po.closed_at = now
        po.closure_reason = closure_reason
    await db.flush()
    return po


# ─── Receiving ────────────────────────────────────────────────────────────────

# A receipt cost this far from the item's standing weighted average is worth
# telling a manager about; below it, ordinary supplier drift would be noise.
COST_CHANGE_ALERT_RATIO = Decimal("0.15")


async def _existing_receipt(
    db: AsyncSession,
    business_id: UUID,
    po_id: UUID,
    data: PurchaseReceiptCreate,
    fingerprint: str,
) -> PurchaseReceipt | None:
    existing = await db.scalar(
        select(PurchaseReceipt).where(
            PurchaseReceipt.business_id == business_id,
            PurchaseReceipt.idempotency_key == data.idempotency_key,
        )
    )
    if existing is None:
        return None
    if existing.purchase_order_id != po_id:
        raise PurchasingError(
            "This idempotency key was already used for another purchase order",
            code="IDEMPOTENCY_CONFLICT",
        )
    if existing.request_fingerprint is not None and existing.request_fingerprint != fingerprint:
        raise PurchasingError(
            "This idempotency key was already used for a different receipt",
            code="IDEMPOTENCY_CONFLICT",
        )
    return existing


async def receipt_response(db: AsyncSession, receipt: PurchaseReceipt) -> dict:
    lines = list(
        (
            await db.scalars(
                select(PurchaseReceiptLine)
                .where(
                    PurchaseReceiptLine.receipt_id == receipt.id,
                    PurchaseReceiptLine.business_id == receipt.business_id,
                )
                .order_by(PurchaseReceiptLine.created_at)
            )
        ).all()
    )
    po = await _po(db, receipt.business_id, receipt.purchase_order_id)
    return {
        "id": receipt.id,
        "business_id": receipt.business_id,
        "purchase_order_id": receipt.purchase_order_id,
        "delivery_reference": receipt.delivery_reference,
        "invoice_reference": receipt.invoice_reference,
        "received_at": receipt.received_at,
        "note": receipt.note,
        "purchase_order_status": po.status,
        "lines": lines,
    }


async def receive_purchase_order(
    db: AsyncSession,
    business: Business,
    po_id: UUID,
    actor_id: UUID,
    data: PurchaseReceiptCreate,
) -> tuple[PurchaseReceipt, bool]:
    """Record a delivery against an ordered purchase order.

    Returns the receipt and whether it was newly created, so a retried request
    can be answered without applying stock twice.
    """
    fingerprint = receipt_fingerprint(data)
    existing = await _existing_receipt(db, business.id, po_id, data, fingerprint)
    if existing is not None:
        return existing, False

    po = await _po(db, business.id, po_id, lock=True)

    # Recheck under the purchase order lock so concurrent retries converge on
    # one receipt instead of both missing the unlocked read above and racing
    # into the unique constraint.
    existing = await _existing_receipt(db, business.id, po_id, data, fingerprint)
    if existing is not None:
        return existing, False

    if po.status not in {"ordered", "partially_received"}:
        raise PurchasingError("Only ordered purchase orders can be received", code="CONFLICT")
    if len({line.purchase_order_line_id for line in data.lines}) != len(data.lines):
        raise PurchasingError("A receipt cannot contain a purchase order line twice")

    receipt = PurchaseReceipt(
        business_id=business.id,
        purchase_order_id=po.id,
        received_by=actor_id,
        idempotency_key=data.idempotency_key,
        request_fingerprint=fingerprint,
        delivery_reference=data.delivery_reference,
        invoice_reference=data.invoice_reference,
        note=data.note,
    )
    db.add(receipt)
    await db.flush()

    po_lines = {line.id: line for line in await _lines(db, business.id, po.id)}
    cost_alerts: list[tuple[InventoryItem, Decimal, Decimal]] = []

    for incoming in data.lines:
        line = po_lines.get(incoming.purchase_order_line_id)
        if line is None:
            raise PurchasingError("Receipt line does not belong to this purchase order")
        item = await inventory_service.get_item(
            db, line.inventory_item_id, business.id, for_update=True
        )
        if item is None:
            raise PurchasingError("Receipt inventory mapping is unavailable")
        pack = await _pack(db, business.id, line.pack_conversion_id, item.id)

        if (
            line.received_quantity + incoming.received_quantity > line.ordered_quantity
            and not incoming.discrepancy_reason
        ):
            raise PurchasingError("Over-receipt requires a discrepancy reason")

        # The movement's location must not contradict where the item is stocked.
        if (
            item.location_id is not None
            and po.location_id is not None
            and item.location_id != po.location_id
        ):
            raise PurchasingError(
                "This order delivers to a different location than the item is stocked at"
            )
        movement_location_id = item.location_id or po.location_id

        base_delta = incoming.received_quantity * pack.base_quantity
        unit_cost = (incoming.unit_price / pack.base_quantity).quantize(
            COST_QUANTUM, rounding=ROUND_HALF_UP
        )
        previous_cost = item.weighted_average_cost

        movement = await inventory_service.apply_movement(
            db,
            item,
            movement_type="receive",
            delta=base_delta,
            created_by_id=actor_id,
            location_id=movement_location_id,
            unit_cost_snapshot=unit_cost,
            cost_currency_code=business.currency_code,
            reference_type="purchase_receipt",
            reference_id=receipt.id,
            notes=f"Purchase order {po.reference or po.id}",
        )

        line.received_quantity += incoming.received_quantity
        receipt_line = PurchaseReceiptLine(
            business_id=business.id,
            receipt_id=receipt.id,
            purchase_order_line_id=line.id,
            inventory_item_id=item.id,
            received_quantity=incoming.received_quantity,
            unit_price=incoming.unit_price,
            currency_code=business.currency_code,
            substitution_note=incoming.substitution_note,
            discrepancy_reason=incoming.discrepancy_reason,
            stock_movement_id=movement.id,
        )
        db.add(receipt_line)
        await db.flush()
        db.add(
            PurchasePriceHistory(
                business_id=business.id,
                supplier_product_id=line.supplier_product_id,
                inventory_item_id=item.id,
                receipt_line_id=receipt_line.id,
                unit_cost_per_base_unit=unit_cost,
                currency_code=business.currency_code,
            )
        )
        if line.supplier_product_id is not None:
            product = await _supplier_product(db, business.id, line.supplier_product_id)
            product.last_price = incoming.unit_price

        if previous_cost and previous_cost > 0:
            drift = abs(unit_cost - previous_cost) / previous_cost
            if drift >= COST_CHANGE_ALERT_RATIO:
                cost_alerts.append((item, previous_cost, unit_cost))

    all_lines = await _lines(db, business.id, po.id)
    fully_received = all(
        line.received_quantity >= line.ordered_quantity for line in all_lines
    )
    po.status = "received" if fully_received else "partially_received"
    if fully_received:
        po.closed_at = datetime.now(timezone.utc)
        po.closed_by = actor_id
    await db.flush()
    await _cost_change_alerts(db, business.id, cost_alerts)
    return receipt, True


async def _cost_change_alerts(
    db: AsyncSession,
    business_id: UUID,
    alerts: list[tuple[InventoryItem, Decimal, Decimal]],
) -> None:
    """Notify staff when a receipt cost moves materially against the standing average."""
    for item, previous, current in alerts:
        direction = "rose" if current > previous else "fell"
        await notification_service.notify_business_staff(
            db,
            business_id=business_id,
            kind="inventory_cost_change",
            title=f"{item.name} cost {direction}",
            body=(
                f"Latest receipt cost is {current} per {item.base_unit}, "
                f"against a running average of {previous}."
            ),
            payload={
                "item_id": str(item.id),
                "previous_unit_cost": str(previous),
                "new_unit_cost": str(current),
            },
        )


async def price_history(
    db: AsyncSession,
    business_id: UUID,
    inventory_item_id: UUID,
    *,
    limit: int = 50,
) -> list[PurchasePriceHistory]:
    return list(
        (
            await db.scalars(
                select(PurchasePriceHistory)
                .where(
                    PurchasePriceHistory.business_id == business_id,
                    PurchasePriceHistory.inventory_item_id == inventory_item_id,
                )
                .order_by(PurchasePriceHistory.observed_at.desc())
                .limit(limit)
            )
        ).all()
    )


async def outstanding_on_order(db: AsyncSession, business_id: UUID) -> dict[UUID, Decimal]:
    """Undelivered base-unit quantity per item across open purchase orders.

    This is what "incoming" has to mean for a reorder suggestion: stock that is
    owed but has not yet reached the ledger. Quantities already received are in
    `current_quantity` and must not be counted a second time.
    """
    rows = await db.execute(
        select(
            PurchaseOrderLine.inventory_item_id,
            PurchaseOrderLine.ordered_quantity,
            PurchaseOrderLine.received_quantity,
            InventoryPackConversion.base_quantity,
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .join(
            InventoryPackConversion,
            InventoryPackConversion.id == PurchaseOrderLine.pack_conversion_id,
        )
        .where(
            PurchaseOrderLine.business_id == business_id,
            PurchaseOrder.status.in_(_OPEN_ORDER_STATUSES),
        )
    )
    totals: dict[UUID, Decimal] = {}
    for item_id, ordered, received, base_quantity in rows:
        remaining = ordered - received
        if remaining > 0:
            totals[item_id] = totals.get(item_id, Decimal(0)) + remaining * base_quantity
    return totals


# ─── Attachments ──────────────────────────────────────────────────────────────

# Delivery notes and supplier invoices arrive as a phone photo or a PDF.
ALLOWED_ATTACHMENT_TYPES = {"application/pdf", "image/jpeg", "image/png"}
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


async def add_attachment(
    db: AsyncSession,
    business_id: UUID,
    purchase_order_id: UUID,
    actor_id: UUID,
    *,
    filename: str,
    content_type: str | None,
    data: bytes,
) -> PurchaseOrderAttachment:
    """File a delivery note or invoice against an order.

    The stored `object_key` is storage-relative and never a public URL: these
    are tenant documents, and the public `/uploads` mount would protect them by
    URL obscurity alone.
    """
    po = await _po(db, business_id, purchase_order_id)
    if content_type not in ALLOWED_ATTACHMENT_TYPES:
        raise PurchasingError("Attach a PDF, JPEG or PNG")
    if not data:
        raise PurchasingError("The uploaded file is empty")
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise PurchasingError("Attachments are limited to 10 MB")

    storage = get_storage_service()
    object_key = generate_upload_path(f"purchase-orders/{business_id}", filename)
    await storage.upload(object_key, data)

    attachment = PurchaseOrderAttachment(
        business_id=business_id,
        purchase_order_id=po.id,
        object_key=object_key,
        filename=filename[:255],
        content_type=content_type,
        byte_size=len(data),
        uploaded_by=actor_id,
    )
    db.add(attachment)
    await db.flush()
    return attachment


async def list_attachments(
    db: AsyncSession,
    business_id: UUID,
    purchase_order_id: UUID,
) -> list[PurchaseOrderAttachment]:
    await _po(db, business_id, purchase_order_id)
    return list(
        (
            await db.scalars(
                select(PurchaseOrderAttachment)
                .where(
                    PurchaseOrderAttachment.business_id == business_id,
                    PurchaseOrderAttachment.purchase_order_id == purchase_order_id,
                )
                .order_by(PurchaseOrderAttachment.created_at)
            )
        ).all()
    )


async def _attachment(
    db: AsyncSession,
    business_id: UUID,
    purchase_order_id: UUID,
    attachment_id: UUID,
) -> PurchaseOrderAttachment:
    attachment = await db.scalar(
        select(PurchaseOrderAttachment).where(
            PurchaseOrderAttachment.id == attachment_id,
            PurchaseOrderAttachment.business_id == business_id,
            PurchaseOrderAttachment.purchase_order_id == purchase_order_id,
        )
    )
    if attachment is None:
        raise PurchasingError("Attachment not found", code="NOT_FOUND")
    return attachment


async def read_attachment(
    db: AsyncSession,
    business_id: UUID,
    purchase_order_id: UUID,
    attachment_id: UUID,
) -> tuple[PurchaseOrderAttachment, bytes]:
    attachment = await _attachment(db, business_id, purchase_order_id, attachment_id)
    try:
        data = await get_storage_service().download(attachment.object_key)
    except FileNotFoundError as exc:
        raise PurchasingError("Attachment file is no longer available", code="NOT_FOUND") from exc
    return attachment, data


async def delete_attachment(
    db: AsyncSession,
    business_id: UUID,
    purchase_order_id: UUID,
    attachment_id: UUID,
) -> None:
    attachment = await _attachment(db, business_id, purchase_order_id, attachment_id)
    await get_storage_service().delete(attachment.object_key)
    await db.delete(attachment)
    await db.flush()
