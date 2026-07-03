from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryItem, StockMovement
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
    stmt = select(InventoryItem).where(InventoryItem.business_id == business_id)
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
) -> InventoryItem | None:
    stmt = select(InventoryItem).where(
        InventoryItem.id == item_id,
        InventoryItem.business_id == business_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_item(
    db: AsyncSession,
    business_id: UUID,
    data: InventoryItemCreate,
) -> InventoryItem:
    item = InventoryItem(
        business_id=business_id,
        location_id=data.location_id,
        name=data.name,
        unit=data.unit,
        unit_type=data.unit_type,
        container_volume_ml=data.container_volume_ml,
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
    item = await get_item(db, item_id, business_id)
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
    # container_volume_ml: present (even as null) = set/clear; absent = unchanged.
    # Lets a client null it out when switching an item back to 'each'.
    if "container_volume_ml" in data.model_fields_set:
        item.container_volume_ml = data.container_volume_ml
    if data.par_quantity is not None:
        item.par_quantity = data.par_quantity
    if data.cost_per_unit is not None:
        item.cost_per_unit = data.cost_per_unit
    if data.notes is not None:
        item.notes = data.notes
    if data.location_id is not None:
        item.location_id = data.location_id
    await db.flush()
    await db.refresh(item)
    return item


async def delete_item(
    db: AsyncSession,
    item_id: UUID,
    business_id: UUID,
) -> bool:
    item = await get_item(db, item_id, business_id)
    if item is None:
        return False
    await db.delete(item)
    await db.flush()
    return True


async def apply_movement(
    db: AsyncSession,
    item: InventoryItem,
    *,
    movement_type: str,
    delta: Decimal,
    notes: str | None = None,
    created_by_id: UUID | None = None,
    location_id: UUID | None = None,
) -> StockMovement:
    """Schema-free core: mutate current_quantity, write the movement audit row,
    and fire a low-stock notification on a par breach. Shared by the API-driven
    ``record_movement`` (receive/adjust/waste) and the automatic recipe deduction
    in ``recipe_service`` (movement_type='sale'). ``delta`` is already in the
    item's storage unit (ml for bottle/keg, count for 'each').
    """
    item.current_quantity = (item.current_quantity or Decimal(0)) + delta

    par_breached = (
        item.par_quantity is not None
        and item.current_quantity < item.par_quantity
    )

    movement = StockMovement(
        business_id=item.business_id,
        location_id=location_id,
        item_id=item.id,
        movement_type=movement_type,
        quantity_delta=delta,
        notes=notes,
        created_by=created_by_id,
        alert_triggered=par_breached,
    )
    db.add(movement)
    await db.flush()

    if par_breached:
        await notification_service.notify_business_staff(
            db,
            business_id=item.business_id,
            kind="inventory_low_stock",
            title="Low stock alert",
            body=(
                f"{item.name} is below par level "
                f"({item.current_quantity} {item.unit} remaining, "
                f"par: {item.par_quantity} {item.unit})"
            ),
            payload={
                "item_id": str(item.id),
                "current_quantity": float(item.current_quantity),
                "par_quantity": float(item.par_quantity),
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
    item = await get_item(db, item_id, business_id)
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

    return await apply_movement(
        db,
        item,
        movement_type=data.movement_type,
        delta=delta,
        notes=data.notes,
        created_by_id=created_by_id,
        location_id=data.location_id,
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
    item = await get_item(db, item_id, business_id)
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
    item = await get_item(db, item_id, business_id)
    if item is None:
        raise ValueError(f"Inventory item {item_id} not found for this business")
    stmt = select(func.sum(StockMovement.quantity_delta)).where(
        StockMovement.item_id == item_id
    )
    result = await db.execute(stmt)
    total = result.scalar_one_or_none()
    return total if total is not None else Decimal(0)
