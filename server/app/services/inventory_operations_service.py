"""Stocktake and cycle-count sessions.

A count is the only way stock changes without a purchase, a sale or a manual
adjustment, so every variance it finds becomes an ordinary movement through
`inventory_service.apply_movement` rather than a direct balance write.

Location transfers were migrated in 046/047 but are deliberately not implemented:
the pilot runs one location, nothing in the API creates a second one, and the
transfer model needs per-location stock identity the schema does not have. See
docs/TODO.md for the trigger that revives them.
"""
import csv
import io
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryItem, InventoryPackConversion
from app.models.inventory_operations import InventoryCountLine, InventoryCountSession
from app.schemas.inventory import CountLineUpdate, CountSessionCreate
from app.services import inventory_service

# Count lines are stored at the ledger's own scale, so a converted pack or keg
# entry lands on exactly the grid the balance uses.
QUANTITY_QUANTUM = Decimal("0.001")


class CountSessionError(ValueError):
    def __init__(self, message: str, *, code: str = "VALIDATION_ERROR"):
        self.code = code
        super().__init__(message)


async def _session(
    db: AsyncSession,
    business_id: UUID,
    session_id: UUID,
    *,
    lock: bool = False,
) -> InventoryCountSession:
    stmt = select(InventoryCountSession).where(
        InventoryCountSession.id == session_id,
        InventoryCountSession.business_id == business_id,
    )
    if lock:
        stmt = stmt.with_for_update()
    session = await db.scalar(stmt)
    if session is None:
        raise CountSessionError("Count session not found", code="NOT_FOUND")
    return session


async def _lines(
    db: AsyncSession,
    business_id: UUID,
    session_id: UUID,
) -> list[InventoryCountLine]:
    return list(
        (
            await db.scalars(
                select(InventoryCountLine)
                .where(
                    InventoryCountLine.session_id == session_id,
                    InventoryCountLine.business_id == business_id,
                )
                .order_by(InventoryCountLine.id)
            )
        ).all()
    )


async def create_count_session(
    db: AsyncSession,
    business_id: UUID,
    actor_id: UUID,
    data: CountSessionCreate,
) -> InventoryCountSession:
    """Open a session and seed a line per item from the current book quantity.

    Book quantities are re-read under lock at reconcile time. Seeding them here
    is what lets the count sheet show an expected figure while it is being
    walked, not what the variance is finally computed against.
    """
    if data.location_id is not None:
        await inventory_service.validate_location(db, business_id, data.location_id)

    open_session = await db.scalar(
        select(InventoryCountSession.id).where(
            InventoryCountSession.business_id == business_id,
            InventoryCountSession.location_id == data.location_id
            if data.location_id is not None
            else InventoryCountSession.location_id.is_(None),
            InventoryCountSession.status == "open",
        )
    )
    if open_session is not None:
        raise CountSessionError(
            "A count is already open here. Reconcile or cancel it first.",
            code="CONFLICT",
        )

    stmt = select(InventoryItem).where(
        InventoryItem.business_id == business_id,
        InventoryItem.is_active.is_(True),
    )
    if data.item_ids:
        stmt = stmt.where(InventoryItem.id.in_(data.item_ids))
    items = list((await db.scalars(stmt.order_by(InventoryItem.name))).all())
    if not items:
        raise CountSessionError("A count needs at least one active inventory item")
    if data.item_ids and len(items) != len(set(data.item_ids)):
        raise CountSessionError("Every counted item must be an active item of this business")

    session = InventoryCountSession(
        business_id=business_id,
        location_id=data.location_id,
        kind=data.kind,
        note=data.note,
        opened_by=actor_id,
    )
    db.add(session)
    await db.flush()

    for item in items:
        db.add(
            InventoryCountLine(
                business_id=business_id,
                session_id=session.id,
                inventory_item_id=item.id,
                book_quantity=item.current_quantity,
                counted_quantity=item.current_quantity,
                variance_quantity=Decimal(0),
            )
        )
    await db.flush()
    return session


async def list_count_sessions(
    db: AsyncSession,
    business_id: UUID,
    *,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[InventoryCountSession]:
    stmt = select(InventoryCountSession).where(InventoryCountSession.business_id == business_id)
    if status is not None:
        stmt = stmt.where(InventoryCountSession.status == status)
    return list(
        (
            await db.scalars(
                stmt.order_by(InventoryCountSession.created_at.desc()).limit(limit).offset(offset)
            )
        ).all()
    )


async def count_session_response(
    db: AsyncSession,
    business_id: UUID,
    session: InventoryCountSession,
) -> dict:
    lines = await _lines(db, business_id, session.id)
    names = dict(
        (
            await db.execute(
                select(InventoryItem.id, InventoryItem.name).where(
                    InventoryItem.business_id == business_id,
                    InventoryItem.id.in_([line.inventory_item_id for line in lines]),
                )
            )
        ).all()
    ) if lines else {}
    units = dict(
        (
            await db.execute(
                select(InventoryItem.id, InventoryItem.base_unit).where(
                    InventoryItem.business_id == business_id,
                    InventoryItem.id.in_([line.inventory_item_id for line in lines]),
                )
            )
        ).all()
    ) if lines else {}
    return {
        "id": session.id,
        "business_id": session.business_id,
        "location_id": session.location_id,
        "kind": session.kind,
        "status": session.status,
        "note": session.note,
        "opened_by": session.opened_by,
        "reconciled_by": session.reconciled_by,
        "reconciled_at": session.reconciled_at,
        "created_at": session.created_at,
        "lines": [
            {
                "id": line.id,
                "inventory_item_id": line.inventory_item_id,
                "item_name": names.get(line.inventory_item_id, ""),
                "base_unit": units.get(line.inventory_item_id, ""),
                "book_quantity": line.book_quantity,
                "counted_quantity": line.counted_quantity,
                "variance_quantity": line.variance_quantity,
                "shrinkage_reason": line.shrinkage_reason,
                "note": line.note,
                "movement_id": line.movement_id,
                "entry_mode": line.entry_mode,
                "entry_value": line.entry_value,
                "entry_pack_conversion_id": line.entry_pack_conversion_id,
            }
            for line in lines
        ],
    }


async def get_count_session(
    db: AsyncSession,
    business_id: UUID,
    session_id: UUID,
) -> dict:
    session = await _session(db, business_id, session_id)
    return await count_session_response(db, business_id, session)


async def cancel_count_session(
    db: AsyncSession,
    business_id: UUID,
    session_id: UUID,
) -> InventoryCountSession:
    session = await _session(db, business_id, session_id, lock=True)
    if session.status != "open":
        raise CountSessionError(f"A {session.status} count cannot be cancelled", code="CONFLICT")
    session.status = "cancelled"
    await db.flush()
    return session


# ─── Entering counts ──────────────────────────────────────────────────────────

async def _counted_base_quantity(
    db: AsyncSession,
    business_id: UUID,
    item: InventoryItem,
    entry: CountLineUpdate,
) -> tuple[Decimal, str, Decimal | None, UUID | None]:
    """Resolve one keyed entry to a canonical base-unit quantity.

    A bartender counts in bottles and keg levels, not millilitres. Converting
    here keeps that convenience out of the ledger: the balance only ever sees
    base units, and what was actually keyed is preserved for the audit trail.
    """
    if entry.pack_quantity is not None:
        if entry.pack_conversion_id is None:
            raise CountSessionError("A pack count needs the pack it was counted in")
        pack = await db.scalar(
            select(InventoryPackConversion).where(
                InventoryPackConversion.id == entry.pack_conversion_id,
                InventoryPackConversion.business_id == business_id,
                InventoryPackConversion.inventory_item_id == item.id,
            )
        )
        if pack is None:
            raise CountSessionError("Pack conversion does not belong to this inventory item")
        counted = (entry.pack_quantity * pack.base_quantity).quantize(
            QUANTITY_QUANTUM, rounding=ROUND_HALF_UP
        )
        return counted, "pack", entry.pack_quantity, pack.id

    if entry.keg_level_percent is not None:
        if item.container_volume_ml is None:
            raise CountSessionError(
                "Keg level entry needs a container volume on the inventory item"
            )
        counted = (
            item.container_volume_ml * entry.keg_level_percent / Decimal(100)
        ).quantize(QUANTITY_QUANTUM, rounding=ROUND_HALF_UP)
        return counted, "keg_level", entry.keg_level_percent, None

    if entry.counted_quantity is None:
        raise CountSessionError("Each counted line needs a quantity")
    return (
        entry.counted_quantity.quantize(QUANTITY_QUANTUM, rounding=ROUND_HALF_UP),
        "base_unit",
        None,
        None,
    )


async def apply_count_lines(
    db: AsyncSession,
    business_id: UUID,
    session_id: UUID,
    entries: list[CountLineUpdate],
) -> InventoryCountSession:
    """Write counted quantities onto an open session's lines.

    Takes the session lock so a save cannot interleave with a reconcile that is
    already reading the same lines.
    """
    session = await _session(db, business_id, session_id, lock=True)
    if session.status != "open":
        raise CountSessionError(f"A {session.status} count cannot be edited", code="CONFLICT")

    rows = {line.id: line for line in await _lines(db, business_id, session_id)}
    if len({entry.count_line_id for entry in entries}) != len(entries):
        raise CountSessionError("A save cannot contain the same count line twice")

    for entry in entries:
        line = rows.get(entry.count_line_id)
        if line is None:
            raise CountSessionError("Count line does not belong to this session")
        item = await inventory_service.get_item(db, line.inventory_item_id, business_id)
        if item is None:
            raise CountSessionError("Count item is no longer active")
        counted, mode, entry_value, pack_id = await _counted_base_quantity(
            db, business_id, item, entry
        )
        line.counted_quantity = counted
        line.entry_mode = mode
        line.entry_value = entry_value
        line.entry_pack_conversion_id = pack_id
        line.shrinkage_reason = entry.shrinkage_reason
        line.note = entry.note
    await db.flush()
    return session


async def reconcile_count(
    db: AsyncSession,
    business_id: UUID,
    session_id: UUID,
    actor_id: UUID,
) -> InventoryCountSession:
    """Turn counted-versus-book variance into stock movements and close the session."""
    session = await _session(db, business_id, session_id, lock=True)
    if session.status != "open":
        raise CountSessionError("Only an open count can be reconciled", code="CONFLICT")

    lines = await _lines(db, business_id, session_id)
    if not lines:
        raise CountSessionError("A count needs at least one line")

    for line in lines:
        item = await inventory_service.get_item(
            db, line.inventory_item_id, business_id, for_update=True
        )
        if item is None:
            raise CountSessionError("Count item not found")

        # Re-read the book under lock: the shelf may have moved while the count
        # was being walked, and the variance must be against what the ledger
        # says now, not what it said when the session opened.
        line.book_quantity = item.current_quantity
        line.variance_quantity = line.counted_quantity - item.current_quantity
        if not line.variance_quantity:
            continue
        if line.variance_quantity < 0 and not line.shrinkage_reason:
            raise CountSessionError(
                "A negative count variance requires a shrinkage reason"
            )
        note = f"{line.shrinkage_reason or ''}: {line.note or ''}".strip(": ")
        movement = await inventory_service.apply_movement(
            db,
            item,
            movement_type="adjust" if line.variance_quantity > 0 else "waste",
            delta=line.variance_quantity,
            reason="other" if line.variance_quantity < 0 else None,
            created_by_id=actor_id,
            location_id=session.location_id,
            reference_type="count_reconciliation",
            reference_id=session.id,
            notes=note or "Count reconciliation",
        )
        line.movement_id = movement.id

    session.status = "reconciled"
    session.reconciled_by = actor_id
    session.reconciled_at = datetime.now(timezone.utc)
    await db.flush()
    return session


# ─── Count sheet CSV ──────────────────────────────────────────────────────────

# A stocktake is walked on paper or a phone and keyed back afterwards. The
# export is deliberately the same shape as the import, so a sheet that left the
# system can come back to it without transformation.
CSV_COLUMNS = ["count_line_id", "item_name", "base_unit", "book_quantity", "counted_quantity", "shrinkage_reason", "note"]


async def export_count_sheet(db: AsyncSession, business_id: UUID, session_id: UUID) -> str:
    session = await _session(db, business_id, session_id)
    payload = await count_session_response(db, business_id, session)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for line in payload["lines"]:
        writer.writerow(
            {
                "count_line_id": line["id"],
                "item_name": line["item_name"],
                "base_unit": line["base_unit"],
                "book_quantity": line["book_quantity"],
                "counted_quantity": line["counted_quantity"],
                "shrinkage_reason": line["shrinkage_reason"] or "",
                "note": line["note"] or "",
            }
        )
    return buffer.getvalue()


async def import_count_sheet(
    db: AsyncSession,
    business_id: UUID,
    session_id: UUID,
    content: str,
) -> InventoryCountSession:
    """Read counted quantities back from an exported sheet.

    The whole file is validated before anything is written: a stocktake that
    half-imports is worse than one that is rejected, because the operator cannot
    tell which lines are real.
    """
    try:
        reader = csv.DictReader(io.StringIO(content))
        rows = list(reader)
    except csv.Error as exc:
        raise CountSessionError(f"Could not read the count sheet: {exc}") from exc

    if not rows:
        raise CountSessionError("The count sheet has no rows")
    missing_columns = {"count_line_id", "counted_quantity"} - set(reader.fieldnames or [])
    if missing_columns:
        raise CountSessionError(
            "The count sheet needs the columns " + ", ".join(sorted(missing_columns))
        )

    entries: list[CountLineUpdate] = []
    for index, row in enumerate(rows, start=2):
        raw_id = (row.get("count_line_id") or "").strip()
        raw_quantity = (row.get("counted_quantity") or "").strip()
        if not raw_id:
            raise CountSessionError(f"Row {index} has no count line id")
        try:
            line_id = UUID(raw_id)
        except ValueError as exc:
            raise CountSessionError(f"Row {index} has an invalid count line id") from exc
        if not raw_quantity:
            raise CountSessionError(f"Row {index} has no counted quantity")
        try:
            counted = Decimal(raw_quantity)
        except InvalidOperation as exc:
            raise CountSessionError(f"Row {index} has a non-numeric counted quantity") from exc
        if counted < 0:
            raise CountSessionError(f"Row {index} has a negative counted quantity")
        entries.append(
            CountLineUpdate(
                count_line_id=line_id,
                counted_quantity=counted,
                shrinkage_reason=(row.get("shrinkage_reason") or "").strip() or None,
                note=(row.get("note") or "").strip() or None,
            )
        )

    if len({entry.count_line_id for entry in entries}) != len(entries):
        raise CountSessionError("The count sheet lists the same line twice")
    return await apply_count_lines(db, business_id, session_id, entries)
