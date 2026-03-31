from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryItem, StockMovement
from app.schemas.inventory import InventoryItemCreate, InventoryItemUpdate, StockMovementCreate
from app.services import notification_service


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


async def record_movement(
    db: AsyncSession,
    item_id: UUID,
    business_id: UUID,
    data: StockMovementCreate,
    created_by_id: UUID | None = None,
) -> StockMovement:
    """
    Record a stock movement. Applies the delta to current_quantity, checks for
    a par breach, sets alert_triggered on the movement row, and fires an in-app
    notification to all business staff if the par level is breached.
    Raises ValueError if the item is not found.
    """
    item = await get_item(db, item_id, business_id)
    if item is None:
        raise ValueError(f"Inventory item {item_id} not found for this business")

    item.current_quantity = (item.current_quantity or Decimal(0)) + data.quantity_delta

    par_breached = (
        item.par_quantity is not None
        and item.current_quantity < item.par_quantity
    )

    movement = StockMovement(
        business_id=business_id,
        location_id=data.location_id,
        item_id=item_id,
        movement_type=data.movement_type,
        quantity_delta=data.quantity_delta,
        notes=data.notes,
        created_by=created_by_id,
        alert_triggered=par_breached,
    )
    db.add(movement)
    await db.flush()

    if par_breached:
        await notification_service.notify_business_staff(
            db,
            business_id=business_id,
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
