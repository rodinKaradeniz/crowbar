from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class ReservationCreate(BaseModel):
    business_id: UUID
    service_type_id: UUID
    time: datetime
    phone: str
    email: EmailStr
    note: str | None = None
    guests: int = 1
    payment_amount: float | None = None
    payment_status: str | None = None


class PublicReservationCreate(BaseModel):
    """Schema for unauthenticated (public) reservation creation."""
    business_id: UUID
    service_type_id: UUID
    time: datetime
    phone: str
    email: EmailStr
    name: str
    note: str | None = None
    guests: int = 1
    custom_fields: dict | None = None


class ReservationUpdate(BaseModel):
    service_type_id: UUID | None = None
    time: datetime | None = None
    phone: str | None = None
    email: str | None = None
    note: str | None = None
    status: str | None = None
    guests: int | None = None
    payment_amount: float | None = None
    payment_status: str | None = None


class ReservationResponse(BaseModel):
    id: UUID
    business_id: UUID
    customer_id: UUID
    service_type_id: UUID
    time: datetime
    phone: str
    email: str
    note: str | None = None
    status: str
    guests: int
    payment_amount: float | None = None
    payment_status: str | None = None
    stripe_payment_intent_id: str | None = None
    custom_fields: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
