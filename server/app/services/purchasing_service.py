from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.inventory import InventoryItem, InventoryPackConversion
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine, PurchasePriceHistory, PurchaseReceipt, PurchaseReceiptLine, Supplier
from app.schemas.purchasing import PurchaseOrderCreate, PurchaseReceiptCreate, SupplierCreate
from app.services import inventory_service


class PurchasingError(ValueError):
    pass


async def create_supplier(db: AsyncSession, business_id: UUID, data: SupplierCreate) -> Supplier:
    supplier = Supplier(business_id=business_id, **data.model_dump())
    db.add(supplier)
    await db.flush()
    return supplier


async def list_suppliers(db: AsyncSession, business_id: UUID) -> list[Supplier]:
    return list((await db.scalars(select(Supplier).where(Supplier.business_id == business_id, Supplier.is_active.is_(True)).order_by(Supplier.name))).all())


async def _po(db: AsyncSession, business_id: UUID, purchase_order_id: UUID, *, lock: bool = False) -> PurchaseOrder:
    stmt = select(PurchaseOrder).where(PurchaseOrder.id == purchase_order_id, PurchaseOrder.business_id == business_id)
    if lock:
        stmt = stmt.with_for_update()
    po = await db.scalar(stmt)
    if po is None:
        raise PurchasingError("Purchase order not found")
    return po


async def _lines(db: AsyncSession, business_id: UUID, po_id: UUID) -> list[PurchaseOrderLine]:
    return list((await db.scalars(select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == po_id, PurchaseOrderLine.business_id == business_id).order_by(PurchaseOrderLine.created_at))).all())


async def purchase_order_response(db: AsyncSession, po: PurchaseOrder) -> dict:
    return {"id": po.id, "business_id": po.business_id, "supplier_id": po.supplier_id, "location_id": po.location_id, "status": po.status, "reference": po.reference, "expected_on": po.expected_on, "note": po.note, "approved_by": po.approved_by, "approved_at": po.approved_at, "ordered_at": po.ordered_at, "lines": await _lines(db, po.business_id, po.id)}


async def create_purchase_order(db: AsyncSession, business: Business, actor_id: UUID, data: PurchaseOrderCreate) -> PurchaseOrder:
    supplier = await db.scalar(select(Supplier).where(Supplier.id == data.supplier_id, Supplier.business_id == business.id, Supplier.is_active.is_(True)))
    if supplier is None:
        raise PurchasingError("Supplier not found")
    po = PurchaseOrder(business_id=business.id, supplier_id=supplier.id, location_id=data.location_id, reference=data.reference, expected_on=data.expected_on, note=data.note, created_by=actor_id)
    db.add(po)
    await db.flush()
    seen: set[UUID] = set()
    for line in data.lines:
        if line.inventory_item_id in seen:
            raise PurchasingError("A purchase order cannot contain an inventory item twice")
        seen.add(line.inventory_item_id)
        item = await db.scalar(select(InventoryItem).where(InventoryItem.id == line.inventory_item_id, InventoryItem.business_id == business.id, InventoryItem.is_active.is_(True)))
        pack = await db.scalar(select(InventoryPackConversion).where(InventoryPackConversion.id == line.pack_conversion_id, InventoryPackConversion.business_id == business.id, InventoryPackConversion.inventory_item_id == line.inventory_item_id))
        if item is None or pack is None:
            raise PurchasingError("Each line needs an active tenant inventory item and its pack conversion")
        db.add(PurchaseOrderLine(business_id=business.id, purchase_order_id=po.id, inventory_item_id=item.id, description=line.description, ordered_quantity=line.ordered_quantity, pack_conversion_id=pack.id, unit_price=line.unit_price, currency_code=business.currency_code))
    await db.flush()
    return po


async def transition_purchase_order(db: AsyncSession, business_id: UUID, po_id: UUID, actor_id: UUID, status: str) -> PurchaseOrder:
    po = await _po(db, business_id, po_id, lock=True)
    allowed = {"draft": {"approved", "cancelled"}, "approved": {"ordered", "cancelled"}, "ordered": set()}
    if status not in allowed.get(po.status, set()):
        raise PurchasingError(f"Cannot change a {po.status} purchase order to {status}")
    po.status = status
    if status == "approved":
        po.approved_by, po.approved_at = actor_id, datetime.now(timezone.utc)
    if status == "ordered":
        po.ordered_at = datetime.now(timezone.utc)
    await db.flush()
    return po


async def receive_purchase_order(db: AsyncSession, business: Business, po_id: UUID, actor_id: UUID, data: PurchaseReceiptCreate) -> PurchaseReceipt:
    existing = await db.scalar(select(PurchaseReceipt).where(PurchaseReceipt.business_id == business.id, PurchaseReceipt.idempotency_key == data.idempotency_key))
    if existing is not None:
        if existing.purchase_order_id != po_id:
            raise PurchasingError("Idempotency key has already been used for another purchase order")
        return existing
    po = await _po(db, business.id, po_id, lock=True)
    if po.status not in {"ordered", "partially_received"}:
        raise PurchasingError("Only ordered purchase orders can be received")
    receipt = PurchaseReceipt(business_id=business.id, purchase_order_id=po.id, received_by=actor_id, idempotency_key=data.idempotency_key, delivery_reference=data.delivery_reference, invoice_reference=data.invoice_reference, note=data.note)
    db.add(receipt)
    await db.flush()
    po_lines = {line.id: line for line in await _lines(db, business.id, po.id)}
    if len({line.purchase_order_line_id for line in data.lines}) != len(data.lines):
        raise PurchasingError("A receipt cannot contain a purchase order line twice")
    for incoming in data.lines:
        line = po_lines.get(incoming.purchase_order_line_id)
        if line is None:
            raise PurchasingError("Receipt line does not belong to this purchase order")
        pack = await db.scalar(select(InventoryPackConversion).where(InventoryPackConversion.id == line.pack_conversion_id, InventoryPackConversion.business_id == business.id))
        item = await inventory_service.get_item(db, line.inventory_item_id, business.id, for_update=True)
        if pack is None or item is None:
            raise PurchasingError("Receipt inventory mapping is unavailable")
        if line.received_quantity + incoming.received_quantity > line.ordered_quantity and not incoming.discrepancy_reason:
            raise PurchasingError("Over-receipt requires a discrepancy reason")
        base_delta = incoming.received_quantity * pack.base_quantity
        unit_cost = incoming.unit_price / pack.base_quantity
        movement = await inventory_service.apply_movement(db, item, movement_type="receive", delta=base_delta, created_by_id=actor_id, location_id=po.location_id, unit_cost_snapshot=unit_cost, cost_currency_code=business.currency_code, reference_type="purchase_receipt", reference_id=receipt.id, notes=f"Purchase order {po.reference or po.id}")
        line.received_quantity += incoming.received_quantity
        receipt_line = PurchaseReceiptLine(business_id=business.id, receipt_id=receipt.id, purchase_order_line_id=line.id, inventory_item_id=item.id, received_quantity=incoming.received_quantity, unit_price=incoming.unit_price, currency_code=business.currency_code, substitution_note=incoming.substitution_note, discrepancy_reason=incoming.discrepancy_reason, stock_movement_id=movement.id)
        db.add(receipt_line)
        await db.flush()
        db.add(PurchasePriceHistory(business_id=business.id, inventory_item_id=item.id, receipt_line_id=receipt_line.id, unit_price=unit_cost, currency_code=business.currency_code))
    all_lines = await _lines(db, business.id, po.id)
    po.status = "received" if all(line.received_quantity >= line.ordered_quantity for line in all_lines) else "partially_received"
    await db.flush()
    return receipt
