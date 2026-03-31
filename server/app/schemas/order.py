from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


# ─── Selected modifier (embedded in line item) ────────────────────────────────

class SelectedModifier(BaseModel):
    modifier_id: str
    name: str
    price_delta: Decimal


# ─── Order Line Items ─────────────────────────────────────────────────────────

class OrderLineItemRequest(BaseModel):
    item_id: UUID
    quantity: int = Field(default=1, ge=1)
    selected_modifiers: list[SelectedModifier] = []
    notes: str | None = None


class OrderLineItemResponse(BaseModel):
    id: UUID
    order_id: UUID
    item_id: UUID | None = None
    item_name: str
    quantity: int
    unit_price: Decimal
    selected_modifiers: list[dict] = []
    routing_tag: str
    notes: str | None = None

    model_config = {"from_attributes": True}


# ─── Orders ───────────────────────────────────────────────────────────────────

class OrderPlaceRequest(BaseModel):
    table_identifier: str | None = Field(None, max_length=100)
    items: list[OrderLineItemRequest] = Field(..., min_length=1)
    notes: str | None = None
    idempotency_key: str = Field(..., min_length=1, max_length=100)


class OrderStatusUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(received|preparing|ready|served|cancelled)$")


class OrderStatusTimelineResponse(BaseModel):
    id: UUID
    status: str
    changed_by: UUID | None = None
    changed_at: datetime

    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID | None = None
    session_token: str
    table_identifier: str | None = None
    status: str
    idempotency_key: str
    total_amount: Decimal
    notes: str | None = None
    placed_at: datetime
    line_items: list[OrderLineItemResponse] = []
    status_timeline: list[OrderStatusTimelineResponse] = []

    model_config = {"from_attributes": True}
