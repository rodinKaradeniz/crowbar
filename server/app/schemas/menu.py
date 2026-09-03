from datetime import time
from decimal import Decimal
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import AppBaseModel


def _validate_days(days: list[int]) -> list[int]:
    for d in days:
        if d < 0 or d > 6:
            raise ValueError("days_of_week entries must be 0..6 (0=Monday..6=Sunday)")
    return days


# ─── Menu activation windows ──────────────────────────────────────────────────
# A menu with no windows is always on; a menu with one or more is served only
# inside them. Times are wall-clock in the business's timezone, never UTC.

class MenuActivationWindowCreate(AppBaseModel):
    days_of_week: list[int] = Field(..., min_length=1)
    start_time: time
    end_time: time
    is_active: bool = True

    @field_validator("days_of_week")
    @classmethod
    def check_days(cls, v: list[int]) -> list[int]:
        return _validate_days(v)


class MenuActivationWindowUpdate(AppBaseModel):
    days_of_week: list[int] | None = Field(None, min_length=1)
    start_time: time | None = None
    end_time: time | None = None
    is_active: bool | None = None

    @field_validator("days_of_week")
    @classmethod
    def check_days(cls, v: list[int] | None) -> list[int] | None:
        return _validate_days(v) if v is not None else v


class MenuActivationWindowResponse(AppBaseModel):
    id: UUID
    menu_id: UUID
    business_id: UUID
    days_of_week: list[int]
    start_time: time
    end_time: time
    is_active: bool


# ─── Item Library ─────────────────────────────────────────────────────────────

class LibraryItemCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    price: Decimal = Field(default=Decimal("0.00"), ge=0)
    preparation_station_id: UUID | None = None
    routes_to_all_stations: bool = True
    prep_time_minutes: int | None = Field(None, ge=1)
    tax_profile_id: UUID | None = None


class LibraryItemUpdate(AppBaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    price: Decimal | None = Field(None, ge=0)
    preparation_station_id: UUID | None = None
    routes_to_all_stations: bool | None = None
    prep_time_minutes: int | None = None
    tax_profile_id: UUID | None = None


class LibraryItemResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    name: str
    description: str | None = None
    price: Decimal
    routing_tag: str
    preparation_station_id: UUID | None = None
    routes_to_all_stations: bool
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
    is_alcoholic: bool = False
    is_available: bool = True
    preparation_station_id: UUID | None = None
    routes_to_all_stations: bool = True
    prep_time_minutes: int | None = Field(None, ge=1)
    display_order: int = 0
    image: str | None = None
    tax_profile_id: UUID | None = None
    modifier_groups: list[ModifierGroupCreate] = []


class MenuItemUpdate(AppBaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    price: Decimal | None = Field(None, ge=0)
    # = clear the discount. See update_item in menu_service for the handling.
    is_alcoholic: bool | None = None
    is_available: bool | None = None
    preparation_station_id: UUID | None = None
    routes_to_all_stations: bool | None = None
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
    is_alcoholic: bool = False
    is_available: bool
    routing_tag: str
    preparation_station_id: UUID | None = None
    routes_to_all_stations: bool
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
    activation_windows: list[MenuActivationWindowResponse] = []
    categories: list[MenuCategoryResponse] = []


# Public menu projections intentionally keep only the opaque identifiers a
# browser must submit back when ordering plus guest-facing presentation data.
class PublicModifierResponse(AppBaseModel):
    id: UUID
    name: str
    price_delta: Decimal
    is_available: bool


class PublicModifierGroupResponse(AppBaseModel):
    id: UUID
    name: str
    required: bool
    min_select: int
    max_select: int
    modifiers: list[PublicModifierResponse] = []


class PublicMenuItemResponse(AppBaseModel):
    id: UUID
    name: str
    description: str | None = None
    price: Decimal
    is_alcoholic: bool = False
    is_available: bool
    display_order: int
    image: str | None = None
    tax_rate: Decimal | None = None
    price_includes_tax: bool | None = None
    modifier_groups: list[PublicModifierGroupResponse] = []


class PublicMenuCategoryResponse(AppBaseModel):
    id: UUID
    name: str
    display_order: int
    is_active: bool
    items: list[PublicMenuItemResponse] = []


class PublicMenuResponse(AppBaseModel):
    name: str
    description: str | None = None
    categories: list[PublicMenuCategoryResponse] = []


class PreparationStationCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    sort_order: int = 0


class PreparationStationUpdate(AppBaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    sort_order: int | None = None


class PreparationStationResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    name: str
    sort_order: int
    is_active: bool


class MenuItemAvailabilityUpdate(AppBaseModel):
    is_available: bool
    reason: str | None = Field(None, max_length=1000)
