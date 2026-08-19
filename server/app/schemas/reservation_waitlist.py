from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.base import AppBaseModel


class ReservationWaitlistCreate(AppBaseModel):
    business_id: UUID
    service_type_id: UUID
    requested_starts_at: datetime
    flexible_until: datetime
    guests: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=3, max_length=50)
    email: EmailStr
    idempotency_key: str = Field(..., min_length=8, max_length=100)


class ReservationWaitlistStaffCreate(ReservationWaitlistCreate):
    pass


class ReservationWaitlistOffer(AppBaseModel):
    reservation_time: datetime


class ReservationWaitlistTerminalCommand(AppBaseModel):
    reason_code: str = Field(..., min_length=1, max_length=32)
    note: str | None = Field(None, max_length=1000)


class ReservationWaitlistResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    service_type_id: UUID
    customer_id: UUID
    requested_starts_at: datetime
    flexible_until: datetime
    guests: int
    status: str
    offered_at: datetime | None = None
    offered_reservation_time: datetime | None = None
    offer_expires_at: datetime | None = None
    accepted_at: datetime | None = None
    accepted_reservation_id: UUID | None = None
    terminal_at: datetime | None = None
    terminal_reason_code: str | None = None
    terminal_reason_note: str | None = None
    management_token: str | None = None
    delivery_state: str | None = None
    created_at: datetime
    updated_at: datetime
