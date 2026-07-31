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


class ReservationWaitlistStaffCreate(ReservationWaitlistCreate):
    pass


class ReservationWaitlistOffer(AppBaseModel):
    reservation_time: datetime


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
    created_at: datetime
    updated_at: datetime
