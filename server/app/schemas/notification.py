from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    id: UUID
    user_id: UUID
    business_id: UUID
    kind: str
    title: str
    body: str
    payload: dict = Field(default_factory=dict)
    read_at: datetime | None
    created_at: datetime
    # Populated when merging linked-account notifications (same email, different user_type)
    source_type: str | None = None

    model_config = {"from_attributes": True}


class UnreadCountResponse(BaseModel):
    count: int
