from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


# ─── Item Library ─────────────────────────────────────────────────────────────

class LibraryItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    price: Decimal = Field(default=Decimal("0.00"), ge=0)
    routing_tag: str = Field(default="kitchen", pattern="^(kitchen|bar|any)$")
    prep_time_minutes: int | None = Field(None, ge=1)


class LibraryItemUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    price: Decimal | None = None
    routing_tag: str | None = Field(None, pattern="^(kitchen|bar|any)$")
    prep_time_minutes: int | None = None


class LibraryItemResponse(BaseModel):
    id: UUID
    business_id: UUID
    name: str
    description: str | None = None
    price: Decimal
    routing_tag: str
    prep_time_minutes: int | None = None

    model_config = {"from_attributes": True}


# ─── Ordering settings ────────────────────────────────────────────────────────

class OrderingSettingsUpdate(BaseModel):
    is_accepting_orders: bool


# ─── Modifiers ────────────────────────────────────────────────────────────────

class ModifierCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    price_delta: Decimal = Field(default=Decimal("0.00"), ge=0)
    is_available: bool = True


class ModifierUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    price_delta: Decimal | None = None
    is_available: bool | None = None


class ModifierResponse(BaseModel):
    id: UUID
    group_id: UUID
    business_id: UUID
    name: str
    price_delta: Decimal
    is_available: bool

    model_config = {"from_attributes": True}


# ─── Modifier Groups ──────────────────────────────────────────────────────────

class ModifierGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    required: bool = False
    min_select: int = Field(default=0, ge=0)
    max_select: int = Field(default=1, ge=1)
    modifiers: list[ModifierCreate] = []


class ModifierGroupResponse(BaseModel):
    id: UUID
    item_id: UUID
    business_id: UUID
    name: str
    required: bool
    min_select: int
    max_select: int
    modifiers: list[ModifierResponse] = []

    model_config = {"from_attributes": True}


# ─── Menu Items ───────────────────────────────────────────────────────────────

class MenuItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    price: Decimal = Field(default=Decimal("0.00"), ge=0)
    is_available: bool = True
    routing_tag: str = Field(default="kitchen", pattern="^(kitchen|bar|any)$")
    prep_time_minutes: int | None = Field(None, ge=1)
    display_order: int = 0
    image: str | None = None
    modifier_groups: list[ModifierGroupCreate] = []


class MenuItemUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    price: Decimal | None = None
    is_available: bool | None = None
    routing_tag: str | None = Field(None, pattern="^(kitchen|bar|any)$")
    prep_time_minutes: int | None = None
    display_order: int | None = None
    image: str | None = None


class MenuItemResponse(BaseModel):
    id: UUID
    category_id: UUID
    business_id: UUID
    name: str
    description: str | None = None
    price: Decimal
    is_available: bool
    routing_tag: str
    prep_time_minutes: int | None = None
    display_order: int
    image: str | None = None
    modifier_groups: list[ModifierGroupResponse] = []

    model_config = {"from_attributes": True}


# ─── Menu Categories ──────────────────────────────────────────────────────────

class MenuCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    display_order: int = 0
    items: list[MenuItemCreate] = []


class MenuCategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    display_order: int | None = None
    is_active: bool | None = None


class MenuCategoryResponse(BaseModel):
    id: UUID
    menu_id: UUID
    business_id: UUID
    name: str
    display_order: int
    is_active: bool
    items: list[MenuItemResponse] = []

    model_config = {"from_attributes": True}


# ─── Menus ────────────────────────────────────────────────────────────────────

class MenuCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    location_id: UUID | None = None
    categories: list[MenuCategoryCreate] = []


class MenuUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None


class MenuResponse(BaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID | None = None
    name: str
    description: str | None = None
    is_active: bool
    categories: list[MenuCategoryResponse] = []

    model_config = {"from_attributes": True}
