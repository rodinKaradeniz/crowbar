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


class TabCloseRequest(AppBaseModel):
    settled_method: str = Field(..., pattern="^(cash|card|comp|other)$")


class TabResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    table_id: UUID | None = None
    customer_id: UUID | None = None
    status: str
    channel: str
    opened_by: UUID
    opened_at: datetime
    closed_by: UUID | None = None
    closed_at: datetime | None = None
    settled_method: str | None = None
    # Computed live over associated orders — not stored on the tab row.
    total: Decimal
    orders: list[OrderResponse] = []

