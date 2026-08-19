from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import AppBaseModel


# ─── Selected modifier (embedded in line item) ────────────────────────────────

class SelectedModifier(AppBaseModel):
    modifier_id: UUID


# ─── Order Line Items ─────────────────────────────────────────────────────────

class OrderLineItemRequest(AppBaseModel):
    item_id: UUID
    quantity: int = Field(default=1, ge=1)
    selected_modifiers: list[SelectedModifier] = []
    notes: str | None = None


class OrderLineItemResponse(AppBaseModel):
    id: UUID
    order_id: UUID
    item_id: UUID | None = None
    item_name: str
    quantity: int
    unit_price: Decimal
    currency_code: str
    tax_profile_id: UUID | None = None
    tax_profile_version_id: UUID | None = None
    tax_profile_name: str
    tax_profile_code: str
    tax_rate: Decimal
    price_includes_tax: bool
    subtotal_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    selected_modifiers: list[dict] = []
    routing_tag: str
    preparation_station_id: UUID | None = None
    preparation_station_name: str | None = None
    routes_to_all_stations: bool
    line_status: str
    is_alcoholic: bool = False
    notes: str | None = None



# ─── Orders ───────────────────────────────────────────────────────────────────

class OrderPlaceRequest(AppBaseModel):
    # Legacy compatibility only. New public dine-in ordering resolves a signed
    # registered-table credential instead of accepting a browser-entered label.
    table_identifier: str | None = Field(None, max_length=100)
    table_token: str | None = Field(None, min_length=16, max_length=500)
    items: list[OrderLineItemRequest] = Field(..., min_length=1, max_length=100)
    notes: str | None = Field(None, max_length=2000)
    idempotency_key: str = Field(..., min_length=1, max_length=100)
    # Self-attestation that the guest is of legal drinking age. Required (must be
    # True) at placement only when the cart contains an alcoholic item on a
    # customer self-service channel; re-validated server-side (see order_service).
    age_confirmed: bool = False


class OrderStatusUpdateRequest(AppBaseModel):
    status: str = Field(..., pattern="^(received|preparing|ready|served)$")


class OrderLineStatusUpdateRequest(AppBaseModel):
    status: str = Field(..., pattern="^(received|preparing|ready|served)$")


class OrderCorrectionRequest(AppBaseModel):
    items: list[OrderLineItemRequest] = Field(..., min_length=1, max_length=100)
    notes: str | None = Field(None, max_length=2000)
    reason: str = Field(..., min_length=1, max_length=1000)
    idempotency_key: str = Field(..., min_length=8, max_length=100)


class OrderCancellationRequest(AppBaseModel):
    reason: str = Field(..., min_length=1, max_length=1000)
    idempotency_key: str = Field(..., min_length=8, max_length=100)


class OrderStatusTimelineResponse(AppBaseModel):
    id: UUID
    from_status: str | None = None
    status: str
    changed_by: UUID | None = None
    changed_at: datetime



class OrderResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID | None = None
    table_id: UUID | None = None
    tab_id: UUID | None = None
    session_token: str
    table_identifier: str | None = None
    status: str
    idempotency_key: str
    currency_code: str
    subtotal_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    notes: str | None = None
    placed_at: datetime
    cancelled_by: UUID | None = None
    cancelled_at: datetime | None = None
    cancellation_reason: str | None = None
    line_items: list[OrderLineItemResponse] = []
    status_timeline: list[OrderStatusTimelineResponse] = []


class OrderAllDayCount(AppBaseModel):
    preparation_station_id: UUID | None = None
    preparation_station_name: str | None = None
    routes_to_all_stations: bool
    item_name: str
    line_status: str
    quantity: int
