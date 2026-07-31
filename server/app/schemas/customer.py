from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import AppBaseModel


class CustomerResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    date_of_birth: date | None = None
    preferences: str | None = None
    dietary_details: str | None = None
    dietary_details_source: str | None = None
    dietary_details_recorded_at: datetime | None = None
    anonymized_at: datetime | None = None
    merged_into_customer_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class CustomerProfileUpdate(AppBaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    date_of_birth: date | None = None
    preferences: str | None = Field(default=None, max_length=2000)
    dietary_details: str | None = Field(default=None, max_length=1000)
    save_dietary_details: bool = False

    @field_validator("name", "email", "preferences", "dietary_details", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class CustomerTagCreate(AppBaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class CustomerTagResponse(AppBaseModel):
    id: UUID
    name: str
    created_by: UUID | None = None
    created_at: datetime


class CustomerNoteCreate(AppBaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=5000)

    @field_validator("title", "body", mode="before")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip()


class CustomerNoteUpdate(AppBaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    body: str | None = Field(default=None, min_length=1, max_length=5000)

    @field_validator("title", "body", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class CustomerNoteResponse(AppBaseModel):
    id: UUID
    title: str
    body: str
    created_by: UUID | None = None
    updated_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class CustomerMarketingConsentResponse(AppBaseModel):
    channel: Literal["email", "sms"]
    is_consented: bool
    source: str
    notice_version: str
    captured_at: datetime
    withdrawn_at: datetime | None = None


class GuestTimelineEntry(AppBaseModel):
    id: str
    kind: Literal["reservation", "queue", "tab", "order", "note"]
    occurred_at: datetime
    title: str
    detail: str | None = None
    amount: Decimal | None = None
    status: str | None = None


class CustomerProfileResponse(CustomerResponse):
    tags: list[CustomerTagResponse] = []
    notes: list[CustomerNoteResponse] = []
    consents: list[CustomerMarketingConsentResponse] = []
    timeline: list[GuestTimelineEntry] = []


class CustomerMergeRequest(AppBaseModel):
    source_customer_id: UUID


class CustomerDataRequestCreate(AppBaseModel):
    request_type: Literal["export", "correction", "deletion"]
    detail: str | None = Field(default=None, max_length=1000)


class CustomerDataRequestResponse(AppBaseModel):
    id: UUID
    request_type: str
    status: str
    detail: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class GuestBoardContext(AppBaseModel):
    customer_id: UUID
    tags: list[str] = []
    dietary_details: str | None = None
    preferences: str | None = None
