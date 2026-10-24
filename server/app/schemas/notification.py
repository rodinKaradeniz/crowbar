from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import AppBaseModel


class NotificationResponse(AppBaseModel):
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



class VenueDataRequest(AppBaseModel):
    """The live state of the request row a guest data notification points at."""

    id: UUID
    customer_id: UUID
    request_type: str
    status: str
    completed_at: datetime | None = None
    completed_by_name: str | None = None


class VenueNotificationResponse(AppBaseModel):
    """One venue event. No `read_at`: reading is per person, completing is not."""

    id: UUID
    kind: str
    title: str
    body: str
    payload: dict = Field(default_factory=dict)
    created_at: datetime
    data_request: VenueDataRequest | None = None


class UnreadCountResponse(AppBaseModel):
    count: int
