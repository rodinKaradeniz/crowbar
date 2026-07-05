from datetime import datetime
from uuid import UUID

import phonenumbers
from pydantic import EmailStr, field_validator

from app.schemas.base import AppBaseModel


def _normalize_phone(v: str | None) -> str | None:
    if not v:
        return v
    try:
        parsed = phonenumbers.parse(v, "US")
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        return v


class ReservationCreate(AppBaseModel):
    business_id: UUID
    service_type_id: UUID
    time: datetime
    phone: str
    email: EmailStr
    note: str | None = None
    guests: int = 1

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        return _normalize_phone(v) or v


class PublicReservationCreate(AppBaseModel):
    """Schema for unauthenticated (public) reservation creation."""
    business_id: UUID
    service_type_id: UUID
    time: datetime
    phone: str
    email: EmailStr
    name: str
    note: str | None = None
    guests: int = 1

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        return _normalize_phone(v) or v


class ReservationUpdate(AppBaseModel):
    service_type_id: UUID | None = None
    time: datetime | None = None
    phone: str | None = None
    email: str | None = None
    note: str | None = None
    status: str | None = None
    guests: int | None = None


class ReservationResponse(AppBaseModel):
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
    created_at: datetime
    updated_at: datetime

