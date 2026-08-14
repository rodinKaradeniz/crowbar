from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryDiscrepancy, InventoryItem, StockMovement
from app.models.location import Location
from app.models.recipe import MenuItemIngredient
from app.schemas.inventory import InventoryItemCreate, InventoryItemUpdate, StockMovementCreate
from app.services import notification_service


class UnitTypeChangeBlocked(Exception):
    """Raised when a unit_type edit would silently reinterpret existing recipe
    quantities (count ↔ ml). Mapped to 409 by the router."""


def _crosses_each_liquid_boundary(old: str, new: str) -> bool:
    """True only for 'each' ↔ {'bottle','keg'} transitions — the boundary where
    the meaning of a stored recipe quantity flips (count vs ml). 'bottle' ↔ 'keg'
    is exempt (both are ml, identical math)."""
    old_liquid = old in ("bottle", "keg")
    new_liquid = new in ("bottle", "keg")
    return old_liquid != new_liquid


async def list_items(
    db: AsyncSession,
    business_id: UUID,
    location_id: UUID | None = None,
) -> list[InventoryItem]:
    """List all inventory items for a business, low-stock items first."""
    stmt = select(InventoryItem).where(
        InventoryItem.business_id == business_id,
        InventoryItem.is_active.is_(True),
    )
    if location_id is not None:
        stmt = stmt.where(InventoryItem.location_id == location_id)
    # Low-stock items first: par is set AND current < par; then alphabetical
    stmt = stmt.order_by(
        (
            (InventoryItem.par_quantity.is_not(None))
            & (InventoryItem.current_quantity < InventoryItem.par_quantity)
        ).desc(),
        InventoryItem.name,
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_item(
    db: AsyncSession,
    item_id: UUID,
    business_id: UUID,
    *,
    include_archived: bool = False,
    for_update: bool = False,
) -> InventoryItem | None:
    stmt = select(InventoryItem).where(
        InventoryItem.id == item_id,
        InventoryItem.business_id == business_id,
    )
    if not include_archived:
        stmt = stmt.where(InventoryItem.is_active.is_(True))
    if for_update:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _validate_location(
    db: AsyncSession, business_id: UUID, location_id: UUID | None
) -> None:
    if location_id is None:
        return
    exists = await db.scalar(
        select(Location.id).where(
            Location.id == location_id,
            Location.business_id == business_id,
        )
    )
    if exists is None:
        raise ValueError("Location does not belong to this business")


async def create_item(
    db: AsyncSession,
    business_id: UUID,
    data: InventoryItemCreate,
) -> InventoryItem:
    await _validate_location(db, business_id, data.location_id)
    item = InventoryItem(
        business_id=business_id,
        location_id=data.location_id,
        name=data.name,
        unit=data.unit,
        unit_type=data.unit_type,
        container_volume_ml=data.container_volume_ml,
        default_pour_ml=data.default_pour_ml,
        par_quantity=data.par_quantity,
        cost_per_unit=data.cost_per_unit,
        notes=data.notes,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def update_item(
    db: AsyncSession,
    item_id: UUID,
    business_id: UUID,
    data: InventoryItemUpdate,
) -> InventoryItem | None:
    item = await get_item(db, item_id, business_id, for_update=True)
    if item is None:
        return None
    if data.name is not None:
        item.name = data.name
    if data.unit is not None:
        item.unit = data.unit
    if data.unit_type is not None and data.unit_type != item.unit_type:
        # Guard: a count↔ml boundary change would silently reinterpret the
        # quantity stored in any recipe that references this item (Non-Obvious
        # #37). Block it while recipes depend on the item; bottle↔keg is safe.
        if _crosses_each_liquid_boundary(item.unit_type, data.unit_type):
            ref_count = await db.scalar(
                select(func.count())
                .select_from(MenuItemIngredient)
                .where(MenuItemIngredient.inventory_item_id == item.id)
            )
            if ref_count:
                raise UnitTypeChangeBlocked(
                    f"This item is used in {ref_count} recipe(s); remove or update "
                    f"those recipe references before changing its unit type between "
                    f"count-based and volume-based."
                )
        item.unit_type = data.unit_type
    if "location_id" in data.model_fields_set:
        await _validate_location(db, business_id, data.location_id)

    effective_unit_type = data.unit_type or item.unit_type
    effective_container_volume = (
        data.container_volume_ml
        if "container_volume_ml" in data.model_fields_set
        else item.container_volume_ml
    )
    effective_default_pour = (
        data.default_pour_ml
        if "default_pour_ml" in data.model_fields_set
        else item.default_pour_ml
    )
    if effective_unit_type in {"bottle", "keg"}:
        if effective_container_volume is None:
            raise ValueError("container_volume_ml is required for bottle and keg items")
    elif effective_container_volume is not None or effective_default_pour is not None:
        raise ValueError("Container and pour volumes are only valid for liquid items")

    # container_volume_ml: present (even as null) = set/clear; absent = unchanged.
    # Lets a client null it out when switching an item back to 'each'.
    if "container_volume_ml" in data.model_fields_set:
        item.container_volume_ml = data.container_volume_ml
    # default_pour_ml: present (even as null) = set/clear; absent = unchanged, so a
    # client can clear the reference pour size by sending null.
    if "default_pour_ml" in data.model_fields_set:
        item.default_pour_ml = data.default_pour_ml
    if "par_quantity" in data.model_fields_set:
        item.par_quantity = data.par_quantity
    if "cost_per_unit" in data.model_fields_set:
        item.cost_per_unit = data.cost_per_unit
    if "notes" in data.model_fields_set:
        item.notes = data.notes
    if "location_id" in data.model_fields_set:
        item.location_id = data.location_id
    await db.flush()
    await db.refresh(item)
    return item


async def delete_item(
    db: AsyncSession,
    item_id: UUID,
    business_id: UUID,
) -> bool:
    item = await get_item(db, item_id, business_id, for_update=True)
    if item is None:
        return False
    item.is_active = False
    item.archived_at = datetime.now(timezone.utc)
    await db.flush()
    return True


async def apply_movement(
    db: AsyncSession,
    item: InventoryItem,
    *,
    movement_type: str,
    delta: Decimal,
    reason: str | None = None,
    notes: str | None = None,
    created_by_id: UUID | None = None,
    location_id: UUID | None = None,
    order_id: UUID | None = None,
) -> StockMovement:
    """Schema-free core: mutate current_quantity, write the movement audit row,
    and fire a low-stock notification on a par breach. Shared by the API-driven
    ``record_movement`` (receive/adjust/waste) and the automatic recipe deduction
    /reversal in ``recipe_service`` (movement_type='sale'/'sale_reversal'). ``delta``
    is already in the item's storage unit (ml for bottle/keg, count for 'each').
    ``order_id`` links a sale/reversal movement to its order so an un-serve can
    credit back exactly what was deducted.
    """
    locked_item = await get_item(
        db,
        item.id,
        item.business_id,
        include_archived=True,
        for_update=True,
    )
    if locked_item is None:
        raise ValueError("Inventory item no longer exists")
    if not locked_item.is_active and movement_type not in {"sale_reversal"}:
        raise ValueError("Inventory item is archived")
    previous_quantity = locked_item.current_quantity or Decimal(0)
    locked_item.current_quantity = previous_quantity + delta

    par_breached = (
        locked_item.par_quantity is not None
        and previous_quantity >= locked_item.par_quantity
        and locked_item.current_quantity < locked_item.par_quantity
    )

    movement = StockMovement(
        business_id=locked_item.business_id,
        location_id=location_id,
        item_id=locked_item.id,
        order_id=order_id,
        movement_type=movement_type,
        quantity_delta=delta,
        reason=reason,
        notes=notes,
        created_by=created_by_id,
        alert_triggered=par_breached,
    )
    db.add(movement)
    await db.flush()

    if par_breached:
        await notification_service.notify_business_staff(
            db,
            business_id=locked_item.business_id,
            kind="inventory_low_stock",
            title="Low stock alert",
            body=(
                f"{locked_item.name} is below par level "
                f"({locked_item.current_quantity} {locked_item.unit} remaining, "
                f"par: {locked_item.par_quantity} {locked_item.unit})"
            ),
            payload={
                "item_id": str(locked_item.id),
                "current_quantity": float(locked_item.current_quantity),
                "par_quantity": float(locked_item.par_quantity),
            },
        )

    await db.refresh(movement)
    return movement


async def record_movement(
    db: AsyncSession,
    item_id: UUID,
    business_id: UUID,
    data: StockMovementCreate,
    created_by_id: UUID | None = None,
) -> StockMovement:
    """
    Record a manual stock movement (receive/adjust/waste). Resolves the effective
    delta, then delegates to ``apply_movement``. Raises ValueError if not found.
    """
    item = await get_item(db, item_id, business_id, for_update=True)
    if item is None:
        raise ValueError(f"Inventory item {item_id} not found for this business")

    # Resolve the effective ml/native delta. For a bottle/keg receipt entered as a
    # container count, convert to the item's storage unit (ml) via container_volume_ml.
    if data.container_quantity is not None:
        if item.container_volume_ml is None:
            raise ValueError(
                "container_quantity requires the item to have a container_volume_ml."
            )
        delta = data.container_quantity * item.container_volume_ml
    else:
        delta = data.quantity_delta

    effective_location_id = data.location_id or item.location_id
    await _validate_location(db, business_id, effective_location_id)
    if (
        data.location_id is not None
        and item.location_id is not None
        and data.location_id != item.location_id
    ):
        raise ValueError("Movement location must match the inventory item location")

    return await apply_movement(
        db,
        item,
        movement_type=data.movement_type,
        delta=delta,
        reason=data.reason,
        notes=data.notes,
        created_by_id=created_by_id,
        location_id=effective_location_id,
    )


async def list_movements(
    db: AsyncSession,
    item_id: UUID,
    business_id: UUID,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[StockMovement]:
    # Verify item belongs to this business
    item = await get_item(db, item_id, business_id, include_archived=True)
    if item is None:
        return []
    stmt = (
        select(StockMovement)
        .where(StockMovement.item_id == item_id)
        .order_by(StockMovement.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_low_stock_items(
    db: AsyncSession,
    business_id: UUID,
) -> list[InventoryItem]:
    stmt = (
        select(InventoryItem)
        .where(
            InventoryItem.business_id == business_id,
            InventoryItem.is_active.is_(True),
            InventoryItem.par_quantity.is_not(None),
            InventoryItem.current_quantity < InventoryItem.par_quantity,
        )
        .order_by(InventoryItem.name)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def recompute_quantity_from_movements(
    db: AsyncSession,
    item_id: UUID,
    business_id: UUID,
) -> Decimal:
    """
    Compute the canonical quantity by summing all movement deltas.
    Useful for verification / reconciliation — does not mutate the item.
    """
    item = await get_item(db, item_id, business_id, include_archived=True)
    if item is None:
        raise ValueError(f"Inventory item {item_id} not found for this business")
    stmt = select(func.sum(StockMovement.quantity_delta)).where(
        StockMovement.item_id == item_id
    )
    result = await db.execute(stmt)
    total = result.scalar_one_or_none()
    return total if total is not None else Decimal(0)


async def record_discrepancy(
    db: AsyncSession,
    *,
    business_id: UUID,
    kind: str,
    details: str,
    order_id: UUID | None = None,
    item_id: UUID | None = None,
) -> InventoryDiscrepancy:
    discrepancy = InventoryDiscrepancy(
        business_id=business_id,
        order_id=order_id,
        item_id=item_id,
        kind=kind,
        details=details,
    )
    db.add(discrepancy)
    await db.flush()
    return discrepancy


async def list_discrepancies(
    db: AsyncSession, business_id: UUID, *, status: str = "open"
) -> list[InventoryDiscrepancy]:
    rows = await db.scalars(
        select(InventoryDiscrepancy)
        .where(
            InventoryDiscrepancy.business_id == business_id,
            InventoryDiscrepancy.status == status,
        )
        .order_by(InventoryDiscrepancy.created_at.desc())
    )
    return list(rows.all())


async def reconcile_business(
    db: AsyncSession, business_id: UUID
) -> list[InventoryDiscrepancy]:
    rows = await db.execute(
        select(
            InventoryItem,
            func.coalesce(func.sum(StockMovement.quantity_delta), 0),
        )
        .outerjoin(StockMovement, StockMovement.item_id == InventoryItem.id)
        .where(InventoryItem.business_id == business_id)
        .group_by(InventoryItem.id)
    )
    incidents: list[InventoryDiscrepancy] = []
    for item, ledger_quantity in rows.all():
        if item.current_quantity == ledger_quantity:
            continue
        existing = await db.scalar(
            select(InventoryDiscrepancy).where(
                InventoryDiscrepancy.business_id == business_id,
                InventoryDiscrepancy.item_id == item.id,
                InventoryDiscrepancy.kind == "ledger_mismatch",
                InventoryDiscrepancy.status == "open",
            )
        )
        if existing is not None:
            incidents.append(existing)
            continue
        incidents.append(
            await record_discrepancy(
                db,
                business_id=business_id,
                item_id=item.id,
                kind="ledger_mismatch",
                details=(
                    f"Stored quantity {item.current_quantity} does not match "
                    f"movement ledger {ledger_quantity}"
                ),
            )
        )
    return incidents
