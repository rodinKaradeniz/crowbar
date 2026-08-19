from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import AppBaseModel

from app.schemas.order import OrderResponse


class TabOpenRequest(AppBaseModel):
    table_id: UUID | None = None
    customer_id: UUID | None = None
    channel: str = Field(default="staff", max_length=16)


class TabSettleExternallyRequest(AppBaseModel):
    idempotency_key: str = Field(..., min_length=8, max_length=100)
    informational_method: str | None = Field(
        None, pattern="^(cash|card|mixed|other)$"
    )
    note: str | None = Field(None, max_length=2000)
    external_register_reference: str | None = Field(None, max_length=255)


class TabReopenRequest(AppBaseModel):
    idempotency_key: str = Field(..., min_length=8, max_length=100)
    reason: str = Field(..., min_length=1, max_length=1000)


class TabSettlementEventResponse(AppBaseModel):
    id: UUID
    event_type: str
    actor_id: UUID | None = None
    occurred_at: datetime
    currency_code: str
    total_snapshot: Decimal
    informational_method: str | None = None
    note: str | None = None
    external_register_reference: str | None = None
    related_settlement_event_id: UUID | None = None


class TabResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    table_id: UUID | None = None
    seating_id: UUID | None = None
    customer_id: UUID | None = None
    status: str
    channel: str
    opened_by: UUID | None = None
    opened_at: datetime
    closed_by: UUID | None = None
    closed_at: datetime | None = None
    settled_method: str | None = None
    current_settlement_event_id: UUID | None = None
    settlement_events: list[TabSettlementEventResponse] = []
    # Computed live over associated orders — not stored on the tab row.
    total: Decimal
    orders: list[OrderResponse] = []
