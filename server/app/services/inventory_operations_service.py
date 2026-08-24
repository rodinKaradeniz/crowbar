from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.inventory_operations import InventoryCountLine, InventoryCountSession, InventoryTransfer, InventoryTransferLine
from app.services import inventory_service

async def dispatch_transfer(db: AsyncSession, business_id: UUID, transfer_id: UUID, actor_id: UUID):
    transfer = await db.scalar(select(InventoryTransfer).where(InventoryTransfer.id == transfer_id, InventoryTransfer.business_id == business_id).with_for_update())
    if transfer is None or transfer.status != "draft": raise ValueError("Only a draft transfer can be dispatched")
    lines = list((await db.scalars(select(InventoryTransferLine).where(InventoryTransferLine.transfer_id == transfer.id, InventoryTransferLine.business_id == business_id))).all())
    if not lines: raise ValueError("A transfer needs at least one line")
    for line in lines:
        item = await inventory_service.get_item(db, line.inventory_item_id, business_id, for_update=True)
        if item is None or item.location_id != transfer.source_location_id: raise ValueError("Transfer item is not stocked at the source location")
        line.dispatched_movement_id = (await inventory_service.apply_movement(db, item, movement_type="adjust", delta=-line.quantity, created_by_id=actor_id, location_id=transfer.source_location_id, reference_type="transfer_dispatch", reference_id=transfer.id, notes="Transfer dispatched")).id
    transfer.status, transfer.dispatched_at = "in_transit", datetime.now(timezone.utc); await db.flush(); return transfer

async def receive_transfer(db: AsyncSession, business_id: UUID, transfer_id: UUID, actor_id: UUID):
    transfer = await db.scalar(select(InventoryTransfer).where(InventoryTransfer.id == transfer_id, InventoryTransfer.business_id == business_id).with_for_update())
    if transfer is None or transfer.status != "in_transit": raise ValueError("Only an in-transit transfer can be received")
    lines = list((await db.scalars(select(InventoryTransferLine).where(InventoryTransferLine.transfer_id == transfer.id, InventoryTransferLine.business_id == business_id))).all())
    for line in lines:
        if line.destination_inventory_item_id is None: raise ValueError("Every transfer line needs a destination inventory item")
        item = await inventory_service.get_item(db, line.destination_inventory_item_id, business_id, for_update=True)
        if item is None or item.location_id != transfer.destination_location_id: raise ValueError("Destination inventory item is not stocked at the destination location")
        received = line.received_quantity if line.received_quantity is not None else line.quantity
        if received != line.quantity and not line.discrepancy_reason: raise ValueError("Transfer variance requires a discrepancy reason")
        line.received_movement_id = (await inventory_service.apply_movement(db, item, movement_type="receive", delta=received, created_by_id=actor_id, location_id=transfer.destination_location_id, reference_type="transfer_receipt", reference_id=transfer.id, notes=line.discrepancy_reason or "Transfer received")).id
    transfer.status, transfer.received_at, transfer.received_by = "reconciled", datetime.now(timezone.utc), actor_id
    await db.flush(); return transfer

async def reconcile_count(db: AsyncSession, business_id: UUID, session_id: UUID, actor_id: UUID):
    session = await db.scalar(select(InventoryCountSession).where(InventoryCountSession.id == session_id, InventoryCountSession.business_id == business_id).with_for_update())
    if session is None or session.status != "open": raise ValueError("Only an open count can be reconciled")
    lines = list((await db.scalars(select(InventoryCountLine).where(InventoryCountLine.session_id == session.id, InventoryCountLine.business_id == business_id))).all())
    if not lines: raise ValueError("A count needs at least one line")
    for line in lines:
        item = await inventory_service.get_item(db, line.inventory_item_id, business_id, for_update=True)
        if item is None: raise ValueError("Count item not found")
        line.book_quantity = item.current_quantity; line.variance_quantity = line.counted_quantity - item.current_quantity
        if line.variance_quantity:
            if line.variance_quantity < 0 and not line.shrinkage_reason: raise ValueError("A negative count variance requires a shrinkage reason")
            line.movement_id = (await inventory_service.apply_movement(db, item, movement_type="adjust" if line.variance_quantity > 0 else "waste", delta=line.variance_quantity, reason="other" if line.variance_quantity < 0 else None, created_by_id=actor_id, location_id=session.location_id, reference_type="count_reconciliation", reference_id=session.id, notes=f"{line.shrinkage_reason or ''}: {line.note or ''}".strip(": "))).id
    session.status, session.reconciled_by, session.reconciled_at = "reconciled", actor_id, datetime.now(timezone.utc); await db.flush(); return session

async def apply_transfer_receipt_lines(db, business_id, transfer_id, lines):
    rows = {row.id: row for row in (await db.scalars(select(InventoryTransferLine).where(InventoryTransferLine.transfer_id == transfer_id, InventoryTransferLine.business_id == business_id))).all()}
    for data in lines:
        row = rows.get(data.transfer_line_id)
        if row is None: raise ValueError("Transfer receipt line does not belong to this transfer")
        if data.received_quantity != row.quantity and not data.discrepancy_reason: raise ValueError("Transfer variance requires a discrepancy reason")
        row.received_quantity, row.discrepancy_reason = data.received_quantity, data.discrepancy_reason

async def apply_count_lines(db, business_id, session_id, lines):
    rows = {row.id: row for row in (await db.scalars(select(InventoryCountLine).where(InventoryCountLine.session_id == session_id, InventoryCountLine.business_id == business_id))).all()}
    for data in lines:
        row = rows.get(data.count_line_id)
        if row is None: raise ValueError("Count line does not belong to this session")
        row.counted_quantity, row.shrinkage_reason, row.note = data.counted_quantity, data.shrinkage_reason, data.note
