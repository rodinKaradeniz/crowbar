from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class QueueJoinRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    party_size: int = Field(1, ge=1, le=20)
    phone: str | None = None


class QueueEntryResponse(BaseModel):
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

    model_config = {"from_attributes": True}


class QueueStatusResponse(BaseModel):
    entry: QueueEntryResponse
    total_waiting: int
    estimated_wait_minutes: int | None = None  # position * 5 min heuristic
