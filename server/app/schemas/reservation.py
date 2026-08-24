from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, EmailStr, Field, field_validator

from app.schemas.base import AppBaseModel


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
        return v.strip()

    @field_validator("name", "availability_override_reason", mode="before")
    @classmethod
    def strip_staff_text(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None


class PublicReservationCreate(AppBaseModel):
    """Schema for unauthenticated (public) reservation creation."""
    business_id: UUID
    service_type_id: UUID
    time: datetime
    phone: str = Field(min_length=3, max_length=32)
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    note: str | None = Field(default=None, max_length=1000)
    guests: int = Field(default=1, ge=1, le=100)
    marketing_email_opt_in: bool = False
    marketing_sms_opt_in: bool = False
    idempotency_key: str = Field(min_length=1, max_length=100)

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        return v.strip()


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


class ReservationNoShow(AppBaseModel):
    note: str | None = Field(default=None, max_length=1000)


class PublicReservationManagementReschedule(AppBaseModel):
    service_type_id: UUID
    time: datetime
    guests: int = Field(ge=1)


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
    phone: str | None
    email: str | None
    note: str | None = None
    status: str
    guests: int
    availability_override_by: UUID | None = None
    availability_override_actor_name: str | None = None
    availability_override_reason: str | None = None
    availability_overridden_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancelled_by: str | None = None
    cancelled_late: bool | None = None
    no_show_at: datetime | None = None
    no_show_note: str | None = None
    reconfirmed_at: datetime | None = None
    cancellation_window_minutes: int | None = None
    arrival_grace_period_minutes: int | None = None
    reminder_enabled: bool | None = None
    reminder_lead_minutes: int | None = None
    reconfirmation_enabled: bool | None = None
    created_at: datetime
    updated_at: datetime


class PublicReservationResponse(AppBaseModel):
    business_id: UUID
    service_type_id: UUID
    time: datetime
    ends_at: datetime
    phone: str | None
    email: str | None
    note: str | None = None
    status: str
    guests: int
    cancelled_late: bool | None = None
    reconfirmed_at: datetime | None = None
