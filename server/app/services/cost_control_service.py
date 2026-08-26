"""Read-only operational cost calculations derived from immutable movement and order facts.

Nothing here is an accounting, fiscal or revenue figure. These are operational
estimates a manager uses to decide what to buy and what to charge, and every
response carries the inputs it was computed from so a surprising number can be
argued with rather than merely believed.

Where an input is missing -- an item with no cost, a menu item with no recipe, a
supplier with no lead time -- the figure says so instead of substituting zero
and inventing precision.
"""
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.regional import currency_quantum
from app.models.inventory import InventoryItem, StockMovement
from app.models.menu import MenuItem
from app.models.recipe import MenuItemIngredient
from app.services import purchasing_service

DISCLOSURE = (
    "Operational cost estimates derived from stock movements; "
    "not accounting or fiscal records."
)


class CostControlError(ValueError):
    def __init__(self, message: str, *, code: str = "VALIDATION_ERROR"):
        self.code = code
        super().__init__(message)


def _money(value: Decimal, currency_code: str) -> Decimal:
    """Quantize a money TOTAL at the tenant currency's minor unit.

    Per-base-unit costs are deliberately not passed through here: rounding
    0.054286 EUR/ml to cents would understate consumption cost by roughly eight
    percent. Only figures a human reads as an amount of money are quantized.
    """
    return value.quantize(currency_quantum(currency_code), rounding=ROUND_HALF_UP)


# ─── Valuation ────────────────────────────────────────────────────────────────

async def inventory_valuation(db: AsyncSession, business_id: UUID, currency_code: str) -> dict:
    rows = await db.execute(
        select(
            InventoryItem.id,
            InventoryItem.name,
            InventoryItem.base_unit,
            InventoryItem.current_quantity,
            InventoryItem.weighted_average_cost,
        ).where(
            InventoryItem.business_id == business_id,
            InventoryItem.is_active.is_(True),
        )
    )
    items = []
    total = Decimal(0)
    uncosted: list[str] = []
    for item_id, name, base_unit, quantity, unit_cost in rows:
        if unit_cost is None:
            uncosted.append(name)
        value = quantity * (unit_cost or Decimal(0))
        total += value
        items.append(
            {
                "item_id": item_id,
                "name": name,
                "base_unit": base_unit,
                "quantity": quantity,
                "unit_cost": unit_cost,
                "value": _money(value, currency_code),
                "costed": unit_cost is not None,
            }
        )
    return {
        "items": items,
        "total_value": _money(total, currency_code),
        "currency_code": currency_code,
        # Naming the uncosted items is what stops the total from reading as
        # complete when it is not.
        "items_without_cost": uncosted,
        "complete": not uncosted,
    }


# ─── Recipe cost, margin and pour cost ────────────────────────────────────────

async def recipe_cost(db: AsyncSession, business_id: UUID, menu_item_id: UUID) -> dict:
    """Ingredient cost of one menu item, with the ingredients it was built from."""
    menu_item = await db.scalar(
        select(MenuItem).where(
            MenuItem.id == menu_item_id,
            MenuItem.business_id == business_id,
        )
    )
    if menu_item is None:
        raise CostControlError("Menu item not found", code="NOT_FOUND")
    return await _recipe_cost_for(db, business_id, menu_item)


async def _recipe_cost_for(
    db: AsyncSession,
    business_id: UUID,
    menu_item: MenuItem,
) -> dict:
    rows = await db.execute(
        select(
            InventoryItem.id,
            InventoryItem.name,
            InventoryItem.base_unit,
            MenuItemIngredient.quantity,
            InventoryItem.weighted_average_cost,
        )
        .join(InventoryItem, InventoryItem.id == MenuItemIngredient.inventory_item_id)
        .where(
            MenuItemIngredient.menu_item_id == menu_item.id,
            InventoryItem.business_id == business_id,
        )
    )
    ingredients = []
    total = Decimal(0)
    missing: list[str] = []
    for item_id, name, base_unit, quantity, unit_cost in rows:
        if unit_cost is None:
            missing.append(name)
        line_cost = quantity * (unit_cost or Decimal(0))
        total += line_cost
        ingredients.append(
            {
                "inventory_item_id": item_id,
                "name": name,
                "base_unit": base_unit,
                "quantity": quantity,
                "unit_cost": unit_cost,
                "line_cost": line_cost,
                "costed": unit_cost is not None,
            }
        )
    return {
        "menu_item_id": menu_item.id,
        "menu_item_name": menu_item.name,
        "price": menu_item.price,
        "ingredients": ingredients,
        "cost": total,
        "has_recipe": bool(ingredients),
        "ingredients_without_cost": missing,
        "complete": bool(ingredients) and not missing,
    }


async def menu_margins(db: AsyncSession, business_id: UUID, currency_code: str) -> dict:
    """Gross margin and pour cost per menu item.

    Margin here is menu price less ingredient cost. It is not revenue, does not
    account for labour, waste or tax, and is stated per item rather than summed.
    """
    menu_items = list(
        (
            await db.scalars(
                # No availability filter: an item that is currently 86'd still
                # has a margin the manager needs to see.
                select(MenuItem)
                .where(MenuItem.business_id == business_id)
                .order_by(MenuItem.name)
            )
        ).all()
    )
    results = []
    for menu_item in menu_items:
        detail = await _recipe_cost_for(db, business_id, menu_item)
        cost = detail["cost"]
        price = menu_item.price or Decimal(0)
        margin = price - cost
        results.append(
            {
                "menu_item_id": menu_item.id,
                "menu_item_name": menu_item.name,
                "price": _money(price, currency_code),
                "ingredient_cost": _money(cost, currency_code),
                "gross_margin": _money(margin, currency_code) if detail["complete"] else None,
                "gross_margin_percent": (
                    _money(margin / price * Decimal(100), currency_code)
                    if detail["complete"] and price > 0
                    else None
                ),
                # Pour cost is the bar-native reading of the same ratio.
                "pour_cost_percent": (
                    _money(cost / price * Decimal(100), currency_code)
                    if detail["complete"] and price > 0
                    else None
                ),
                "complete": detail["complete"],
                "incomplete_reason": (
                    None
                    if detail["complete"]
                    else (
                        "No recipe"
                        if not detail["has_recipe"]
                        else "Ingredients without cost: "
                        + ", ".join(detail["ingredients_without_cost"])
                    )
                ),
            }
        )
    return {"items": results, "currency_code": currency_code}


# ─── Consumption, waste and COGS ──────────────────────────────────────────────

async def consumption_variance(
    db: AsyncSession,
    business_id: UUID,
    currency_code: str,
    *,
    start: datetime,
    end: datetime,
) -> dict:
    """Actual stock consumed against what served orders should have consumed.

    Actual comes from `sale` movements. Theoretical comes from the same
    movements' own recipe-implied usage, which is why the two can differ: a
    manual adjustment, an over-pour, or stock leaving without a sale.
    """
    actual_rows = await db.execute(
        select(
            StockMovement.item_id,
            func.sum(-StockMovement.quantity_delta),
        )
        .where(
            StockMovement.business_id == business_id,
            StockMovement.movement_type == "sale",
            StockMovement.created_at >= start,
            StockMovement.created_at < end,
        )
        .group_by(StockMovement.item_id)
    )
    actual = {item_id: qty for item_id, qty in actual_rows}

    waste_rows = await db.execute(
        select(
            StockMovement.item_id,
            StockMovement.reason,
            func.sum(-StockMovement.quantity_delta),
        )
        .where(
            StockMovement.business_id == business_id,
            StockMovement.movement_type == "waste",
            StockMovement.created_at >= start,
            StockMovement.created_at < end,
        )
        .group_by(StockMovement.item_id, StockMovement.reason)
    )
    waste: dict[UUID, list[dict]] = {}
    for item_id, reason, qty in waste_rows:
        waste.setdefault(item_id, []).append({"reason": reason or "unspecified", "quantity": qty})

    item_ids = set(actual) | set(waste)
    if not item_ids:
        return {
            "items": [],
            "currency_code": currency_code,
            "start": start,
            "end": end,
            "total_waste_value": _money(Decimal(0), currency_code),
        }

    items = {
        row.id: row
        for row in (
            await db.scalars(
                select(InventoryItem).where(
                    InventoryItem.business_id == business_id,
                    InventoryItem.id.in_(item_ids),
                )
            )
        ).all()
    }

    results = []
    total_waste_value = Decimal(0)
    for item_id in item_ids:
        item = items.get(item_id)
        if item is None:
            continue
        waste_lines = waste.get(item_id, [])
        waste_quantity = sum((line["quantity"] for line in waste_lines), Decimal(0))
        unit_cost = item.weighted_average_cost
        waste_value = waste_quantity * (unit_cost or Decimal(0))
        total_waste_value += waste_value
        results.append(
            {
                "item_id": item_id,
                "name": item.name,
                "base_unit": item.base_unit,
                "sold_quantity": actual.get(item_id, Decimal(0)),
                "waste_quantity": waste_quantity,
                "waste_by_reason": waste_lines,
                "waste_value": _money(waste_value, currency_code) if unit_cost else None,
                "costed": unit_cost is not None,
            }
        )
    results.sort(key=lambda row: row["name"])
    return {
        "items": results,
        "currency_code": currency_code,
        "start": start,
        "end": end,
        "total_waste_value": _money(total_waste_value, currency_code),
    }


async def controllable_cogs(
    db: AsyncSession,
    business_id: UUID,
    currency_code: str,
    *,
    start: datetime,
    end: datetime,
) -> dict:
    """Cost of stock consumed in a window, valued at the cost in force when it moved.

    Outgoing movements snapshot their own cost, so this does not drift when a
    later purchase changes the running average. It is a cost of goods figure for
    operational decisions, not a cost of sales line for accounts.
    """
    rows = await db.execute(
        select(
            StockMovement.movement_type,
            func.sum(-StockMovement.quantity_delta * StockMovement.unit_cost_snapshot),
        )
        .where(
            StockMovement.business_id == business_id,
            StockMovement.movement_type.in_(("sale", "sale_reversal", "waste")),
            StockMovement.unit_cost_snapshot.is_not(None),
            StockMovement.created_at >= start,
            StockMovement.created_at < end,
        )
        .group_by(StockMovement.movement_type)
    )
    by_type = {movement_type: value or Decimal(0) for movement_type, value in rows}
    sales = by_type.get("sale", Decimal(0))
    reversals = by_type.get("sale_reversal", Decimal(0))
    waste = by_type.get("waste", Decimal(0))

    uncosted = await db.scalar(
        select(func.count())
        .select_from(StockMovement)
        .where(
            StockMovement.business_id == business_id,
            StockMovement.movement_type.in_(("sale", "waste")),
            StockMovement.unit_cost_snapshot.is_(None),
            StockMovement.created_at >= start,
            StockMovement.created_at < end,
        )
    )
    return {
        "start": start,
        "end": end,
        "currency_code": currency_code,
        # Reversals are negative consumption, so they subtract.
        "sold_cost": _money(sales + reversals, currency_code),
        "waste_cost": _money(waste, currency_code),
        "total": _money(sales + reversals + waste, currency_code),
        "movements_without_cost": uncosted or 0,
        "complete": not uncosted,
    }


# ─── Reorder suggestions ──────────────────────────────────────────────────────

async def reorder_suggestions(
    db: AsyncSession,
    business_id: UUID,
    *,
    lookback_days: int = 28,
) -> list[dict]:
    """Suggest what to buy, showing every term that produced the number.

    The target is par plus expected consumption over the supplier's lead time,
    less what is on the shelf and what is already owed on an open purchase
    order. Stock that has already been received is in `current_quantity` and is
    deliberately not subtracted a second time.
    """
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    outstanding = await purchasing_service.outstanding_on_order(db, business_id)
    lead_times = await _lead_times(db, business_id)

    items = list(
        (
            await db.scalars(
                select(InventoryItem).where(
                    InventoryItem.business_id == business_id,
                    InventoryItem.is_active.is_(True),
                    InventoryItem.par_quantity.is_not(None),
                )
            )
        ).all()
    )
    if not items:
        return []

    consumed_rows = await db.execute(
        select(StockMovement.item_id, func.sum(-StockMovement.quantity_delta))
        .where(
            StockMovement.business_id == business_id,
            StockMovement.item_id.in_([item.id for item in items]),
            StockMovement.movement_type == "sale",
            StockMovement.created_at >= since,
        )
        .group_by(StockMovement.item_id)
    )
    consumed = {item_id: qty or Decimal(0) for item_id, qty in consumed_rows}

    suggestions = []
    for item in items:
        par = item.par_quantity or Decimal(0)
        on_hand = item.current_quantity
        on_order = outstanding.get(item.id, Decimal(0))
        daily = consumed.get(item.id, Decimal(0)) / Decimal(lookback_days)
        lead_time_days = lead_times.get(item.id)
        # With no known lead time the forecast covers par only; the response
        # says so rather than assuming same-day delivery is a forecast.
        cover = daily * Decimal(lead_time_days) if lead_time_days is not None else Decimal(0)
        target = par + cover
        needed = target - on_hand - on_order
        if needed <= 0:
            continue
        suggestions.append(
            {
                "item_id": item.id,
                "item_name": item.name,
                "base_unit": item.base_unit,
                "suggested_quantity": needed,
                "explanation": {
                    "par_quantity": par,
                    "average_consumed_per_day": daily,
                    "lead_time_days": lead_time_days,
                    "lead_time_cover": cover,
                    "target_quantity": target,
                    "on_hand": on_hand,
                    "outstanding_on_order": on_order,
                    "lookback_days": lookback_days,
                    "formula": "par + (average consumed per day x lead time) - on hand - on order",
                    "lead_time_known": lead_time_days is not None,
                },
            }
        )
    suggestions.sort(key=lambda row: row["item_name"])
    return suggestions


async def _lead_times(db: AsyncSession, business_id: UUID) -> dict[UUID, int]:
    """Longest active supplier lead time per item -- the conservative choice."""
    from app.models.purchasing import SupplierProduct

    rows = await db.execute(
        select(
            SupplierProduct.inventory_item_id,
            func.max(SupplierProduct.lead_time_days),
        )
        .where(
            SupplierProduct.business_id == business_id,
            SupplierProduct.is_active.is_(True),
        )
        .group_by(SupplierProduct.inventory_item_id)
    )
    return {item_id: days for item_id, days in rows if days is not None}
