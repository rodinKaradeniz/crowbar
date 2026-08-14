from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import AppBaseModel


# ─── Item Library ─────────────────────────────────────────────────────────────

class LibraryItemCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    price: Decimal = Field(default=Decimal("0.00"), ge=0)
    routing_tag: str = Field(default="kitchen", pattern="^(kitchen|bar|any)$")
    prep_time_minutes: int | None = Field(None, ge=1)
    tax_profile_id: UUID | None = None


class LibraryItemUpdate(AppBaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    price: Decimal | None = Field(None, ge=0)
    routing_tag: str | None = Field(None, pattern="^(kitchen|bar|any)$")
    prep_time_minutes: int | None = None
    tax_profile_id: UUID | None = None


class LibraryItemResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    name: str
    description: str | None = None
    price: Decimal
    routing_tag: str
    prep_time_minutes: int | None = None
    tax_profile_id: UUID



# ─── Ordering settings ────────────────────────────────────────────────────────

class OrderingSettingsUpdate(AppBaseModel):
    is_accepting_orders: bool


# ─── Modifiers ────────────────────────────────────────────────────────────────

class ModifierCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    price_delta: Decimal = Field(default=Decimal("0.00"), ge=0)
    is_available: bool = True


class ModifierUpdate(AppBaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    price_delta: Decimal | None = Field(None, ge=0)
    is_available: bool | None = None


class ModifierResponse(AppBaseModel):
    id: UUID
    group_id: UUID
    business_id: UUID
    name: str
    price_delta: Decimal
    is_available: bool



# ─── Modifier Groups ──────────────────────────────────────────────────────────

class ModifierGroupCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    required: bool = False
    min_select: int = Field(default=0, ge=0)
    max_select: int = Field(default=1, ge=1)
    modifiers: list[ModifierCreate] = []


class ModifierGroupResponse(AppBaseModel):
    id: UUID
    item_id: UUID
    business_id: UUID
    name: str
    required: bool
    min_select: int
    max_select: int
    modifiers: list[ModifierResponse] = []



# ─── Menu Items ───────────────────────────────────────────────────────────────

class MenuItemCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    price: Decimal = Field(default=Decimal("0.00"), ge=0)
    happy_hour_price: Decimal | None = Field(default=None, ge=0)
    is_alcoholic: bool = False
    is_available: bool = True
    routing_tag: str = Field(default="kitchen", pattern="^(kitchen|bar|any)$")
    prep_time_minutes: int | None = Field(None, ge=1)
    display_order: int = 0
    image: str | None = None
    tax_profile_id: UUID | None = None
    modifier_groups: list[ModifierGroupCreate] = []


class MenuItemUpdate(AppBaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    price: Decimal | None = Field(None, ge=0)
    # happy_hour_price uses a sentinel-free convention: absent = unchanged, null
    # = clear the discount. See update_item in menu_service for the handling.
    happy_hour_price: Decimal | None = Field(default=None, ge=0)
    is_alcoholic: bool | None = None
    is_available: bool | None = None
    routing_tag: str | None = Field(None, pattern="^(kitchen|bar|any)$")
    prep_time_minutes: int | None = None
    display_order: int | None = None
    image: str | None = None
    tax_profile_id: UUID | None = None


class MenuItemResponse(AppBaseModel):
    id: UUID
    category_id: UUID
    business_id: UUID
    name: str
    description: str | None = None
    price: Decimal
    # Flat happy-hour override price (None = item never discounts). Whether it
    # currently applies is signalled by MenuResponse.happy_hour_active.
    happy_hour_price: Decimal | None = None
    is_alcoholic: bool = False
    is_available: bool
    routing_tag: str
    prep_time_minutes: int | None = None
    display_order: int
    image: str | None = None
    tax_profile_id: UUID
    tax_profile_code: str | None = None
    tax_profile_name: str | None = None
    tax_rate: Decimal | None = None
    price_includes_tax: bool | None = None
    modifier_groups: list[ModifierGroupResponse] = []



# ─── Menu Categories ──────────────────────────────────────────────────────────

class MenuCategoryCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    display_order: int = 0
    items: list[MenuItemCreate] = []


class MenuCategoryUpdate(AppBaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    display_order: int | None = None
    is_active: bool | None = None


class MenuCategoryResponse(AppBaseModel):
    id: UUID
    menu_id: UUID
    business_id: UUID
    name: str
    display_order: int
    is_active: bool
    items: list[MenuItemResponse] = []



# ─── Menus ────────────────────────────────────────────────────────────────────

class MenuCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    location_id: UUID | None = None
    categories: list[MenuCategoryCreate] = []


class MenuUpdate(AppBaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None


class MenuResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID | None = None
    name: str
    description: str | None = None
    is_active: bool
    # Server-computed: whether a happy-hour window is active for this business
    # right now. Set on the public menu read path (defaults False elsewhere).
    # The client must trust this flag rather than computing from local time.
    happy_hour_active: bool = False
    categories: list[MenuCategoryResponse] = []
