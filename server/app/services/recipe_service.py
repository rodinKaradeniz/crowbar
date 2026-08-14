import logging
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryItem, StockMovement
from app.models.menu import MenuItem
from app.models.order import Order
from app.models.recipe import MenuItemIngredient
from app.schemas.recipe import RecipeIngredientInput
from app.services import inventory_service

logger = logging.getLogger(__name__)


async def _menu_item_in_business(
    db: AsyncSession, menu_item_id: UUID, business_id: UUID
) -> MenuItem | None:
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == menu_item_id, MenuItem.business_id == business_id
        )
    )
    return result.scalar_one_or_none()


async def get_recipe(
    db: AsyncSession, menu_item_id: UUID, business_id: UUID
) -> list[dict] | None:
    """Return the recipe (joined with linked inventory items) or None if the
    menu item doesn't belong to this business."""
    if await _menu_item_in_business(db, menu_item_id, business_id) is None:
        return None

    result = await db.execute(
        select(MenuItemIngredient, InventoryItem)
        .join(InventoryItem, MenuItemIngredient.inventory_item_id == InventoryItem.id)
        .where(MenuItemIngredient.menu_item_id == menu_item_id)
        .order_by(InventoryItem.name)
    )
    rows = result.all()
    return [
        {
            "id": ing.id,
            "inventory_item_id": ing.inventory_item_id,
            "inventory_item_name": inv.name,
            "unit_type": inv.unit_type,
            "unit": inv.unit,
            "quantity": ing.quantity,
        }
        for ing, inv in rows
    ]


async def set_recipe(
    db: AsyncSession,
    menu_item_id: UUID,
    business_id: UUID,
    ingredients: list[RecipeIngredientInput],
) -> list[dict] | None:
    """Atomically replace a recipe after every submitted ingredient validates."""
    if await _menu_item_in_business(db, menu_item_id, business_id) is None:
        return None

    submitted_ids = [ingredient.inventory_item_id for ingredient in ingredients]
    if len(submitted_ids) != len(set(submitted_ids)):
        raise ValueError("A recipe cannot contain the same inventory item twice")
    if submitted_ids:
        valid_ids = set(
            (
                await db.scalars(
                    select(InventoryItem.id).where(
                        InventoryItem.id.in_(submitted_ids),
                        InventoryItem.business_id == business_id,
                        InventoryItem.is_active.is_(True),
                    )
                )
            ).all()
        )
        if valid_ids != set(submitted_ids):
            raise ValueError(
                "Every recipe ingredient must be an active inventory item in this business"
            )

    # Only mutate after the complete replacement has validated.
    existing = await db.execute(
        select(MenuItemIngredient).where(
            MenuItemIngredient.menu_item_id == menu_item_id
        )
    )
    for row in existing.scalars().all():
        await db.delete(row)
    await db.flush()

    for ing in ingredients:
        db.add(
            MenuItemIngredient(
                menu_item_id=menu_item_id,
                inventory_item_id=ing.inventory_item_id,
                quantity=ing.quantity,
            )
        )
    await db.flush()
    return await get_recipe(db, menu_item_id, business_id)


async def get_menu_item_stock_info(
    db: AsyncSession, business_id: UUID
) -> list[dict]:
    """Per-menu-item stock info for every menu item that has a recipe:

    - ``has_low_stock_ingredient``: any recipe ingredient is below its par level
      (powers the menu-management low-stock badge, unchanged semantics).
    - ``servings_remaining``: how many more servings the item could currently be
      made from — recipe-exact, computed LIVE (never stored). For each ingredient,
      floor(current_quantity / recipe_quantity); the item's value is the MINIMUM
      across ingredients (the most-constrained one).

    Note this number is NOT independent per menu item: two menu items sharing an
    ingredient both drop when either one sells because inventory is pooled.

    Menu items without a recipe are omitted entirely (no meaningful count — the
    caller shows nothing, never a fabricated 0).
    """
    result = await db.execute(
        select(
            MenuItemIngredient.menu_item_id,
            MenuItemIngredient.quantity,
            InventoryItem.current_quantity,
            InventoryItem.par_quantity,
        ).join(
            InventoryItem, MenuItemIngredient.inventory_item_id == InventoryItem.id
        ).where(
            InventoryItem.business_id == business_id,
        )
    )
    by_item: dict[UUID, dict] = {}
    for menu_item_id, recipe_qty, current_qty, par_qty in result.all():
        agg = by_item.setdefault(
            menu_item_id, {"servings_remaining": None, "has_low_stock_ingredient": False}
        )
        if recipe_qty is not None and recipe_qty > 0:
            servings = int(current_qty // recipe_qty)  # floor of Decimal//Decimal
            agg["servings_remaining"] = (
                servings
                if agg["servings_remaining"] is None
                else min(agg["servings_remaining"], servings)
            )
        if par_qty is not None and current_qty < par_qty:
            agg["has_low_stock_ingredient"] = True

    return [
        {
            "menu_item_id": menu_item_id,
            "servings_remaining": agg["servings_remaining"],
            "has_low_stock_ingredient": agg["has_low_stock_ingredient"],
        }
        for menu_item_id, agg in by_item.items()
    ]


async def _disable_menu_items_for_ingredients(
    db: AsyncSession, business_id: UUID, inventory_item_ids: set[UUID]
) -> None:
    """Set is_available=False on every menu item that requires any of the given
    depleted inventory items. Manual re-enable is required afterwards because
    one availability flag cannot distinguish an automatic 86 from a staff 86."""
    result = await db.execute(
        select(MenuItemIngredient.menu_item_id)
        .where(MenuItemIngredient.inventory_item_id.in_(inventory_item_ids))
        .distinct()
    )
    menu_item_ids = list(result.scalars().all())
    if not menu_item_ids:
        return
    await db.execute(
        update(MenuItem)
        .where(
            MenuItem.id.in_(menu_item_ids),
            MenuItem.business_id == business_id,
            MenuItem.is_available.is_(True),
        )
        .values(is_available=False)
    )


async def deduct_for_served_order(
    db: AsyncSession, order: Order, business_id: UUID
) -> None:
    """Deduct recipe ingredients for a served order via 'sale' movements.

    Best-effort and NON-BLOCKING: a missing recipe, a missing inventory item, or
    a negative result must never fail the order status transition — a bar running
    out mid-service is expected. Par breaches still fire the existing low-stock
    notification (via inventory_service.apply_movement). Any ingredient that hits
    <= 0 auto-disables the menu items that require it (manual re-enable after).
    """
    depleted: set[UUID] = set()
    for li in order.line_items:
        if li.item_id is None:
            continue
        result = await db.execute(
            select(MenuItemIngredient).where(
                MenuItemIngredient.menu_item_id == li.item_id
            )
        )
        ingredients = result.scalars().all()
        for ing in ingredients:
            try:
                async with db.begin_nested():
                    inv = await inventory_service.get_item(
                        db, ing.inventory_item_id, business_id
                    )
                    if inv is None:
                        await inventory_service.record_discrepancy(
                            db,
                            business_id=business_id,
                            order_id=order.id,
                            item_id=ing.inventory_item_id,
                            kind="deduction_missing_item",
                            details=f"Recipe ingredient {ing.id} references an unavailable inventory item",
                        )
                        continue
                    await inventory_service.apply_movement(
                        db,
                        inv,
                        movement_type="sale",
                        delta=-(ing.quantity * li.quantity),
                        order_id=order.id,
                        notes=f"Auto-deduct: {li.item_name} ×{li.quantity}",
                    )
                if inv.current_quantity is not None and inv.current_quantity <= 0:
                    depleted.add(inv.id)
            except Exception:  # noqa: BLE001 — never block a status transition
                logger.exception(
                    "Recipe deduction failed for ingredient %s (order %s)",
                    ing.id,
                    order.id,
                )
                try:
                    await inventory_service.record_discrepancy(
                        db,
                        business_id=business_id,
                        order_id=order.id,
                        item_id=ing.inventory_item_id,
                        kind="deduction_failed",
                        details=f"Automatic deduction failed for recipe ingredient {ing.id}",
                    )
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "Failed to persist inventory discrepancy for order %s",
                        order.id,
                    )
                continue

    if depleted:
        try:
            async with db.begin_nested():
                await _disable_menu_items_for_ingredients(db, business_id, depleted)
        except Exception:  # noqa: BLE001
            logger.exception("Auto-disable on depletion failed for order %s", order.id)
            try:
                await inventory_service.record_discrepancy(
                    db,
                    business_id=business_id,
                    order_id=order.id,
                    kind="auto_86_failed",
                    details="Inventory reached depletion but automatic menu availability update failed",
                )
            except Exception:  # noqa: BLE001
                logger.exception(
                    "Failed to persist auto-86 discrepancy for order %s", order.id
                )


async def reverse_deduction_for_order(
    db: AsyncSession, order: Order, business_id: UUID
) -> None:
    """Credit back inventory that a given order actually deducted, when it's moved
    backward out of 'served'.

    Precise-by-construction: we do NOT recompute from the current recipe (which may
    have changed since the order was served). Instead we sum this order's own real
    'sale' (negative) and 'sale_reversal' (positive) movements per inventory item;
    the net still-deducted amount is exactly what to credit back. This also makes
    repeated serve/un-serve cycles net out correctly and is idempotent — a second
    reversal with nothing outstanding is a no-op.

    Best-effort and NON-BLOCKING, mirroring deduct_for_served_order: a missing
    inventory item or any error is logged and swallowed so it never fails the
    status transition. Auto-disabled menu items are deliberately NOT re-enabled
    here: a single is_available flag cannot distinguish an automatic disable
    from a staff 86, so re-enabling is an explicit staff action.
    """
    result = await db.execute(
        select(
            StockMovement.item_id,
            func.coalesce(func.sum(StockMovement.quantity_delta), 0),
        )
        .where(
            StockMovement.order_id == order.id,
            StockMovement.movement_type.in_(("sale", "sale_reversal")),
        )
        .group_by(StockMovement.item_id)
    )
    for item_id, net in result.all():
        # net < 0 means this order still has that much deducted and outstanding.
        if net is None or net >= 0:
            continue
        credit = -net  # positive amount to add back
        try:
            inv = await inventory_service.get_item(db, item_id, business_id)
            if inv is None:
                logger.warning(
                    "Cannot reverse deduction: inventory item %s missing (order %s)",
                    item_id,
                    order.id,
                )
                continue
            await inventory_service.apply_movement(
                db,
                inv,
                movement_type="sale_reversal",
                delta=credit,
                order_id=order.id,
                notes=f"Reversal: order {order.id} moved back from served",
            )
        except Exception:  # noqa: BLE001 — never block a status transition
            logger.exception(
                "Deduction reversal failed for item %s (order %s)",
                item_id,
                order.id,
            )
            continue
