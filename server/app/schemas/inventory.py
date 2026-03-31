from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


# ─── Inventory Items ──────────────────────────────────────────────────────────

class InventoryItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    unit: str = Field(default="each", max_length=50)
    par_quantity: Decimal | None = Field(default=None, ge=0)
    cost_per_unit: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    location_id: UUID | None = None


class InventoryItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    unit: str | None = Field(default=None, max_length=50)
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
    current_quantity: Decimal
    par_quantity: Decimal | None = None
    cost_per_unit: Decimal | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Stock Movements ──────────────────────────────────────────────────────────

class StockMovementCreate(BaseModel):
    movement_type: str = Field(..., pattern="^(receive|adjust|waste)$")
    quantity_delta: Decimal = Field(..., ne=0)
    notes: str | None = None
    location_id: UUID | None = None


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
