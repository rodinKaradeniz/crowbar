from datetime import datetime
from uuid import UUID

import phonenumbers
from pydantic import Field, field_validator

from app.schemas.base import AppBaseModel


class QueueJoinRequest(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    party_size: int = Field(1, ge=1, le=20)
    phone: str | None = None

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        if not value:
            return value
        try:
            parsed = phonenumbers.parse(value, "US")
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        except phonenumbers.NumberParseException:
            return value.strip() or None


class QueueEntryResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    session_token: str
    name: str
    party_size: int
    phone: str | None = None
    status: str
    position: int | None = None  # rank among waiting entries; None when not waiting
    joined_at: datetime
    called_at: datetime | None = None
    seated_at: datetime | None = None
    completed_at: datetime | None = None



class QueueStatusResponse(AppBaseModel):
    entry: QueueEntryResponse
    total_waiting: int
    estimated_wait_minutes: int | None = None  # position * 5 min heuristic
