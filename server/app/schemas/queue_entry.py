from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import AppBaseModel


class QueueJoinRequest(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    party_size: int = Field(1, ge=1, le=20)
    phone: str | None = Field(default=None, max_length=32)
    idempotency_key: str = Field(..., min_length=8, max_length=100)

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        if not value:
            return value
        return value.strip() or None


class QueueEntryResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    name: str
    party_size: int
    phone: str | None = None
    status: str
    position: int | None = None  # rank among waiting entries; None when not waiting
    joined_at: datetime
    called_at: datetime | None = None
    seated_at: datetime | None = None
    completed_at: datetime | None = None
    removed_at: datetime | None = None
    service_date: date
    terminal_reason_code: str | None = None
    terminal_reason_note: str | None = None
    delivery: DeliverySummary | None = None



class QueueStatusResponse(AppBaseModel):
    entry: QueueEntryResponse
    total_waiting: int
    estimated_wait_minutes: int | None = None


class DeliverySummary(AppBaseModel):
    state: str
    channel: str | None = None
    retryable: bool = False
    attempt_count: int = 0
    last_error: str | None = None


class PublicDeliverySummary(AppBaseModel):
    state: str
    channel: str | None = None


class PublicQueueEntryResponse(AppBaseModel):
    name: str
    party_size: int
    status: str
    position: int | None = None


class PublicQueueStatusResponse(AppBaseModel):
    entry: PublicQueueEntryResponse
    estimated_wait_minutes: int | None = None


class QueueServiceDayUpdate(AppBaseModel):
    status: str = Field(..., pattern="^(open|closed)$")
    max_waiting_covers: int = Field(..., gt=0, le=1000)


class QueueServiceDayResponse(AppBaseModel):
    service_date: date
    status: str
    is_open: bool
    is_full: bool
    max_waiting_covers: int | None = None
    waiting_covers: int
    estimated_wait_minutes: int | None = None
    updated_at: datetime | None = None


class PublicQueueServiceDayResponse(AppBaseModel):
    status: str
    is_open: bool
    is_full: bool
    estimated_wait_minutes: int | None = None


class QueueRemovalRequest(AppBaseModel):
    reason_code: str = Field(..., pattern="^(guest_left|no_show|staff_removed)$")
    note: str | None = Field(None, max_length=1000)


QueueEntryResponse.model_rebuild()
