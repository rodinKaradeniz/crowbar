from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class RecipeIngredientInput(BaseModel):
    """One recipe line as submitted by the recipe builder.

    ``quantity`` is in the linked inventory item's native unit (ml for
    bottle/keg items, count for 'each' items) — the frontend converts any
    oz entry to ml before sending.
    """

    inventory_item_id: UUID
    quantity: Decimal = Field(..., gt=0)


class RecipeSetRequest(BaseModel):
    """Replace-all payload for a menu item's recipe."""

    ingredients: list[RecipeIngredientInput] = []


class RecipeIngredientResponse(BaseModel):
    id: UUID
    inventory_item_id: UUID
    inventory_item_name: str
    unit_type: str  # of the linked inventory item ('each' | 'bottle' | 'keg')
    unit: str  # cosmetic display unit of the linked inventory item
    quantity: Decimal


class MenuItemStockFlag(BaseModel):
    """Whether a menu item has any recipe ingredient below its par level."""

    menu_item_id: UUID
    has_low_stock_ingredient: bool
