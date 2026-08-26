from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import AppBaseModel

# unit_type ∈ {each, bottle, keg}. bottle/keg store liquid quantities in ml.
_UNIT_TYPE_PATTERN = "^(each|bottle|keg|weight)$"
_BASE_UNIT_PATTERN = "^(each|ml|g)$"
_DIMENSION_PATTERN = "^(count|volume|mass)$"
# Structured waste cause (see migration 021). Scoped to waste movements.
_WASTE_REASON_PATTERN = "^(spillage|wrong_measure|breakage|spoilage|other)$"


# ─── Inventory Items ──────────────────────────────────────────────────────────

class InventoryItemCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    unit: str = Field(default="each", max_length=50)
    unit_type: str = Field(default="each", pattern=_UNIT_TYPE_PATTERN)
    base_unit: str | None = Field(default=None, pattern=_BASE_UNIT_PATTERN)
    dimension: str | None = Field(default=None, pattern=_DIMENSION_PATTERN)
    container_volume_ml: Decimal | None = Field(default=None, gt=0)
    # Reference pour size (ml) for the rough pours-remaining estimate. Optional.
    default_pour_ml: Decimal | None = Field(default=None, gt=0)
    par_quantity: Decimal | None = Field(default=None, ge=0)
    cost_per_unit: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    location_id: UUID | None = None

    @model_validator(mode="after")
    def _validate_unit_policy(self):
        is_liquid = self.unit_type in {"bottle", "keg"}
        if is_liquid and self.container_volume_ml is None:
            raise ValueError("container_volume_ml is required for bottle and keg items")
        if not is_liquid and (
            self.container_volume_ml is not None or self.default_pour_ml is not None
        ):
            raise ValueError("Container and pour volumes are only valid for liquid items")
        return self


class InventoryItemUpdate(AppBaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    unit: str | None = Field(default=None, max_length=50)
    unit_type: str | None = Field(default=None, pattern=_UNIT_TYPE_PATTERN)
    base_unit: str | None = Field(default=None, pattern=_BASE_UNIT_PATTERN)
    dimension: str | None = Field(default=None, pattern=_DIMENSION_PATTERN)
    container_volume_ml: Decimal | None = Field(default=None, gt=0)
    default_pour_ml: Decimal | None = Field(default=None, gt=0)
    par_quantity: Decimal | None = Field(default=None, ge=0)
    cost_per_unit: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    location_id: UUID | None = None


class InventoryItemResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID | None = None
    name: str
    unit: str
    unit_type: str
    base_unit: str
    dimension: str
    container_volume_ml: Decimal | None = None
    default_pour_ml: Decimal | None = None
    current_quantity: Decimal
    par_quantity: Decimal | None = None
    cost_per_unit: Decimal | None = None
    weighted_average_cost: Decimal | None = None
    cost_currency_code: str | None = None
    notes: str | None = None
    is_active: bool
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class InventoryPackConversionCreate(AppBaseModel):
    label: str = Field(min_length=1, max_length=120)
    pack_unit: str = Field(pattern="^(case|each|bottle|keg|kilogram|litre|millilitre)$")
    base_quantity: Decimal = Field(gt=0)
    is_default_receiving_unit: bool = False


class InventoryPackConversionResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    inventory_item_id: UUID
    label: str
    pack_unit: str
    base_quantity: Decimal
    is_default_receiving_unit: bool


class CountSessionCreate(AppBaseModel):
    kind: str = Field(pattern="^(stocktake|cycle_count)$")
    location_id: UUID | None = None
    note: str | None = None
    # Omit to count every active item; name items for a targeted cycle count.
    item_ids: list[UUID] | None = None


class CountLineUpdate(AppBaseModel):
    """One counted line. Supply exactly one of the three entry forms.

    `counted_quantity` is in the item's canonical base unit. `pack_quantity`
    counts packs (a part-bottle is a fraction, so 3.4 bottles is valid), and
    `keg_level_percent` reads a keg gauge. The service converts the latter two
    to base units and records which form was keyed.
    """

    count_line_id: UUID
    counted_quantity: Decimal | None = Field(default=None, ge=0)
    pack_conversion_id: UUID | None = None
    pack_quantity: Decimal | None = Field(default=None, ge=0)
    keg_level_percent: Decimal | None = Field(default=None, ge=0, le=100)
    shrinkage_reason: str | None = Field(default=None, max_length=32)
    note: str | None = None

    @model_validator(mode="after")
    def _exactly_one_entry_form(self) -> "CountLineUpdate":
        supplied = [
            self.counted_quantity is not None,
            self.pack_quantity is not None,
            self.keg_level_percent is not None,
        ]
        if sum(supplied) != 1:
            raise ValueError(
                "Supply exactly one of counted_quantity, pack_quantity or keg_level_percent"
            )
        return self


class CountLineResponse(AppBaseModel):
    id: UUID
    inventory_item_id: UUID
    item_name: str
    base_unit: str
    book_quantity: Decimal
    counted_quantity: Decimal
    variance_quantity: Decimal
    shrinkage_reason: str | None = None
    note: str | None = None
    movement_id: UUID | None = None
    entry_mode: str
    entry_value: Decimal | None = None
    entry_pack_conversion_id: UUID | None = None


class CountSessionResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID | None = None
    kind: str
    status: str
    note: str | None = None
    opened_by: UUID | None = None
    reconciled_by: UUID | None = None
    reconciled_at: datetime | None = None
    created_at: datetime
    lines: list[CountLineResponse]


class CountSessionSummary(AppBaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID | None = None
    kind: str
    status: str
    note: str | None = None
    opened_by: UUID | None = None
    reconciled_by: UUID | None = None
    reconciled_at: datetime | None = None
    created_at: datetime



# ─── Stock Movements ──────────────────────────────────────────────────────────

class StockMovementCreate(AppBaseModel):
    # 'sale' is system-generated (recipe deduction) and never accepted from the API.
    movement_type: str = Field(..., pattern="^(receive|adjust|waste)$")
    # Either quantity_delta (in the item's storage unit — ml for bottle/keg) OR,
    # for a bottle/keg receipt, container_quantity (number of containers, converted
    # to ml server-side via the item's container_volume_ml). Exactly one is required.
    quantity_delta: Decimal | None = Field(default=None)
    container_quantity: Decimal | None = Field(default=None, gt=0)
    # Structured cause, required for waste (so it aggregates later), optional for
    # adjust, rejected for receive. `notes` carries any free-text detail.
    reason: str | None = Field(default=None, pattern=_WASTE_REASON_PATTERN)
    notes: str | None = None
    location_id: UUID | None = None

    @model_validator(mode="after")
    def _one_quantity(self) -> "StockMovementCreate":
        if (self.quantity_delta is None) == (self.container_quantity is None):
            raise ValueError(
                "Provide exactly one of quantity_delta or container_quantity."
            )
        if self.quantity_delta is not None and self.quantity_delta == 0:
            raise ValueError("quantity_delta must be non-zero.")
        if self.container_quantity is not None and self.movement_type != "receive":
            raise ValueError("container_quantity is only valid for receive movements.")
        if self.movement_type == "waste" and self.reason is None:
            raise ValueError("reason is required for waste movements.")
        if self.movement_type == "receive" and self.reason is not None:
            raise ValueError("reason is not valid for receive movements.")
        if self.quantity_delta is not None:
            if self.movement_type == "receive" and self.quantity_delta < 0:
                raise ValueError("receive movements require a positive quantity_delta.")
            if self.movement_type == "waste" and self.quantity_delta > 0:
                raise ValueError("waste movements require a negative quantity_delta.")
        return self


class InventoryDiscrepancyResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    order_id: UUID | None = None
    item_id: UUID | None = None
    kind: str
    details: str
    status: str
    created_at: datetime
    resolved_at: datetime | None = None


class StockMovementResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID | None = None
    item_id: UUID
    movement_type: str
    quantity_delta: Decimal
    reason: str | None = None
    notes: str | None = None
    created_by: UUID | None = None
    alert_triggered: bool
    unit_cost_snapshot: Decimal | None = None
    cost_currency_code: str | None = None
    # Attributes a movement to what caused it: a purchase receipt, a count
    # reconciliation, or an order line.
    reference_type: str | None = None
    reference_id: UUID | None = None
    created_at: datetime
