"""Read-only operational cost calculations derived from immutable movement and order facts."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryItem, StockMovement
from app.models.order import Order, OrderLineItem
from app.models.recipe import MenuItemIngredient


async def inventory_valuation(db: AsyncSession, business_id: UUID) -> dict:
    rows = await db.execute(select(InventoryItem.name, InventoryItem.current_quantity, InventoryItem.weighted_average_cost).where(InventoryItem.business_id == business_id, InventoryItem.is_active.is_(True)))
    items, total = [], Decimal(0)
    for name, quantity, unit_cost in rows:
        value = quantity * (unit_cost or Decimal(0))
        items.append({"name": name, "quantity": quantity, "unit_cost": unit_cost, "value": value})
        total += value
    return {"items": items, "total_value": total}


async def recipe_cost(db: AsyncSession, business_id: UUID, menu_item_id: UUID) -> Decimal:
    result = await db.execute(select(MenuItemIngredient.quantity, InventoryItem.weighted_average_cost).join(InventoryItem, InventoryItem.id == MenuItemIngredient.inventory_item_id).where(MenuItemIngredient.menu_item_id == menu_item_id, InventoryItem.business_id == business_id))
    return sum((quantity * (cost or Decimal(0)) for quantity, cost in result), Decimal(0))


async def reorder_suggestions(db: AsyncSession, business_id: UUID, lookback_days: int = 28) -> list[dict]:
    """Explainable conservative forecast: average *served* recipe use per day.
    This intentionally does not reinterpret the reservation-only ML forecast.
    """
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    rows = await db.execute(select(InventoryItem).where(InventoryItem.business_id == business_id, InventoryItem.is_active.is_(True), InventoryItem.par_quantity.is_not(None)))
    suggestions = []
    for item in rows.scalars():
        sold = await db.scalar(select(func.coalesce(func.sum(-StockMovement.quantity_delta), 0)).where(StockMovement.business_id == business_id, StockMovement.item_id == item.id, StockMovement.movement_type == "sale", StockMovement.created_at >= since))
        incoming = await db.scalar(select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(StockMovement.business_id == business_id, StockMovement.item_id == item.id, StockMovement.movement_type == "receive", StockMovement.created_at >= since))
        daily = Decimal(sold or 0) / Decimal(lookback_days)
        target = item.par_quantity or Decimal(0)
        needed = max(Decimal(0), target - item.current_quantity - Decimal(incoming or 0))
        if needed > 0:
            suggestions.append({"item_id": item.id, "item_name": item.name, "suggested_quantity": needed, "base_unit": item.base_unit, "explanation": {"par_quantity": target, "on_hand": item.current_quantity, "open_or_recent_incoming": incoming or Decimal(0), "lookback_days": lookback_days, "average_served_per_day": daily, "forecast_source": "served recipe consumption baseline"}})
    return suggestions
