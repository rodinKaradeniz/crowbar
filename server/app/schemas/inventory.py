from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import AppBaseModel

# unit_type ∈ {each, bottle, keg}. bottle/keg store liquid quantities in ml.
_UNIT_TYPE_PATTERN = "^(each|bottle|keg)$"
# Structured waste cause (see migration 021). Scoped to waste movements.
_WASTE_REASON_PATTERN = "^(spillage|wrong_measure|breakage|spoilage|other)$"


# ─── Inventory Items ──────────────────────────────────────────────────────────

class InventoryItemCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    unit: str = Field(default="each", max_length=50)
    unit_type: str = Field(default="each", pattern=_UNIT_TYPE_PATTERN)
    container_volume_ml: Decimal | None = Field(default=None, gt=0)
    # Reference pour size (ml) for the rough pours-remaining estimate. Optional.
    default_pour_ml: Decimal | None = Field(default=None, gt=0)
    par_quantity: Decimal | None = Field(default=None, ge=0)
    cost_per_unit: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    location_id: UUID | None = None


class InventoryItemUpdate(AppBaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    unit: str | None = Field(default=None, max_length=50)
    unit_type: str | None = Field(default=None, pattern=_UNIT_TYPE_PATTERN)
    container_volume_ml: Decimal | None = Field(default=None, gt=0)
    default_pour_ml: Decimal | None = Field(default=None, gt=0)
    par_quantity: Decimal | None = None
    cost_per_unit: Decimal | None = None
    notes: str | None = None
    location_id: UUID | None = None


class InventoryItemResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID | None = None
    name: str
    unit: str
    unit_type: str
    container_volume_ml: Decimal | None = None
    default_pour_ml: Decimal | None = None
    current_quantity: Decimal
    par_quantity: Decimal | None = None
    cost_per_unit: Decimal | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime



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
        return self


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
    created_at: datetime

