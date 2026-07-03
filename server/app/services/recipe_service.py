import logging
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryItem
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
    """Replace-all: delete the menu item's existing recipe and insert the new
    ingredient rows. Ignores ingredients whose inventory item isn't in this
    business. Returns the resulting recipe, or None if the menu item is unknown."""
    if await _menu_item_in_business(db, menu_item_id, business_id) is None:
        return None

    # Drop existing recipe lines for this menu item.
    existing = await db.execute(
        select(MenuItemIngredient).where(
            MenuItemIngredient.menu_item_id == menu_item_id
        )
    )
    for row in existing.scalars().all():
        await db.delete(row)
    await db.flush()

    # Validate the referenced inventory items belong to this business, dedup by id.
    seen: set[UUID] = set()
    for ing in ingredients:
        if ing.inventory_item_id in seen:
            continue
        inv = await inventory_service.get_item(db, ing.inventory_item_id, business_id)
        if inv is None:
            continue
        seen.add(ing.inventory_item_id)
        db.add(
            MenuItemIngredient(
                menu_item_id=menu_item_id,
                inventory_item_id=ing.inventory_item_id,
                quantity=ing.quantity,
            )
        )
    await db.flush()
    return await get_recipe(db, menu_item_id, business_id)


async def get_low_stock_menu_item_ids(
    db: AsyncSession, business_id: UUID
) -> set[UUID]:
    """Menu item ids that have at least one recipe ingredient below its par level.
    Powers the menu-management low-stock badge (surfaced at the menu-item level)."""
    result = await db.execute(
        select(MenuItemIngredient.menu_item_id)
        .join(
            InventoryItem, MenuItemIngredient.inventory_item_id == InventoryItem.id
        )
        .where(
            InventoryItem.business_id == business_id,
            InventoryItem.par_quantity.is_not(None),
            InventoryItem.current_quantity < InventoryItem.par_quantity,
        )
        .distinct()
    )
    return set(result.scalars().all())


async def _disable_menu_items_for_ingredients(
    db: AsyncSession, business_id: UUID, inventory_item_ids: set[UUID]
) -> None:
    """Set is_available=False on every menu item that requires any of the given
    (now depleted) inventory items. Manual re-enable is required afterwards — see
    CLAUDE.md Non-Obvious 'recipe auto-deduction'."""
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
                inv = await inventory_service.get_item(
                    db, ing.inventory_item_id, business_id
                )
                if inv is None:
                    logger.warning(
                        "Recipe ingredient %s missing inventory item %s; skipping",
                        ing.id,
                        ing.inventory_item_id,
                    )
                    continue
                await inventory_service.apply_movement(
                    db,
                    inv,
                    movement_type="sale",
                    delta=-(ing.quantity * li.quantity),
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
                continue

    if depleted:
        try:
            await _disable_menu_items_for_ingredients(db, business_id, depleted)
        except Exception:  # noqa: BLE001
            logger.exception("Auto-disable on depletion failed for order %s", order.id)
