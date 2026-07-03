from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

# unit_type ∈ {each, bottle, keg}. bottle/keg store liquid quantities in ml.
_UNIT_TYPE_PATTERN = "^(each|bottle|keg)$"


# ─── Inventory Items ──────────────────────────────────────────────────────────

class InventoryItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    unit: str = Field(default="each", max_length=50)
    unit_type: str = Field(default="each", pattern=_UNIT_TYPE_PATTERN)
    container_volume_ml: Decimal | None = Field(default=None, gt=0)
    par_quantity: Decimal | None = Field(default=None, ge=0)
    cost_per_unit: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    location_id: UUID | None = None


class InventoryItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    unit: str | None = Field(default=None, max_length=50)
    unit_type: str | None = Field(default=None, pattern=_UNIT_TYPE_PATTERN)
    container_volume_ml: Decimal | None = Field(default=None, gt=0)
    par_quantity: Decimal | None = None
    cost_per_unit: Decimal | None = None
    notes: str | None = None
    location_id: UUID | None = None


class InventoryItemResponse(BaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID | None = None
    name: str
    unit: str
    unit_type: str
    container_volume_ml: Decimal | None = None
    current_quantity: Decimal
    par_quantity: Decimal | None = None
    cost_per_unit: Decimal | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Stock Movements ──────────────────────────────────────────────────────────

class StockMovementCreate(BaseModel):
    # 'sale' is system-generated (recipe deduction) and never accepted from the API.
    movement_type: str = Field(..., pattern="^(receive|adjust|waste)$")
    # Either quantity_delta (in the item's storage unit — ml for bottle/keg) OR,
    # for a bottle/keg receipt, container_quantity (number of containers, converted
    # to ml server-side via the item's container_volume_ml). Exactly one is required.
    quantity_delta: Decimal | None = Field(default=None)
    container_quantity: Decimal | None = Field(default=None, gt=0)
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
        return self


class StockMovementResponse(BaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID | None = None
    item_id: UUID
    movement_type: str
    quantity_delta: Decimal
    notes: str | None = None
    created_by: UUID | None = None
    alert_triggered: bool
    created_at: datetime

    model_config = {"from_attributes": True}
