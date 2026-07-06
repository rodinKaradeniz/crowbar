from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import AppBaseModel


class RecipeIngredientInput(AppBaseModel):
    """One recipe line as submitted by the recipe builder.

    ``quantity`` is in the linked inventory item's native unit (ml for
    bottle/keg items, count for 'each' items) — the frontend converts any
    oz entry to ml before sending.
    """

    inventory_item_id: UUID
    quantity: Decimal = Field(..., gt=0)


class RecipeSetRequest(AppBaseModel):
    """Replace-all payload for a menu item's recipe."""

    ingredients: list[RecipeIngredientInput] = []


class RecipeIngredientResponse(AppBaseModel):
    id: UUID
    inventory_item_id: UUID
    inventory_item_name: str
    unit_type: str  # of the linked inventory item ('each' | 'bottle' | 'keg')
    unit: str  # cosmetic display unit of the linked inventory item
    quantity: Decimal


class MenuItemStockFlag(AppBaseModel):
    """Stock info for a menu item that has a recipe.

    ``has_low_stock_ingredient`` — any recipe ingredient is below par (amber badge).
    ``servings_remaining`` — recipe-exact live count of how many more servings can
    be made from current stock (min floor across ingredients); never stored. Only
    items with a recipe appear, so this is populated whenever the flag is returned.
    """

    menu_item_id: UUID
    has_low_stock_ingredient: bool
    servings_remaining: int | None = None
