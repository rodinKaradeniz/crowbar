from datetime import datetime
from typing import Literal
from uuid import UUID

import phonenumbers
from pydantic import ConfigDict, EmailStr, Field, field_validator

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
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    service_type_id: UUID
    time: datetime
    name: str = Field(min_length=1, max_length=255)
    phone: str
    email: EmailStr
    note: str | None = None
    guests: int = Field(default=1, ge=1)
    availability_override_reason: str | None = Field(
        default=None, min_length=10, max_length=500
    )

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        return _normalize_phone(v) or v

    @field_validator("name", "availability_override_reason", mode="before")
    @classmethod
    def strip_staff_text(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None


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
    """Non-allocation reservation edits.

    Booking type, party size, and time move together through the dedicated
    reschedule command so capacity validation cannot be bypassed.
    """

    model_config = ConfigDict(from_attributes=True, extra="forbid")

    phone: str | None = None
    email: str | None = None
    note: str | None = None
    status: Literal["pending", "confirmed", "cancelled", "completed"] | None = None


class ReservationReschedule(AppBaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    service_type_id: UUID
    time: datetime
    guests: int = Field(ge=1)
    availability_override_reason: str | None = Field(
        default=None, min_length=10, max_length=500
    )

    @field_validator("availability_override_reason", mode="before")
    @classmethod
    def strip_override_reason(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None


class ReservationResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    customer_id: UUID
    service_type_id: UUID
    time: datetime
    ends_at: datetime
    phone: str
    email: str
    note: str | None = None
    status: str
    guests: int
    availability_override_by: UUID | None = None
    availability_override_actor_name: str | None = None
    availability_override_reason: str | None = None
    availability_overridden_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
