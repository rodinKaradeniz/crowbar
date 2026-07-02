from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ServiceTypeCreate(BaseModel):
    business_id: UUID
    name: str
    description: str | None = None
    capacity: int = 1
    max_concurrent_bookings: int | None = None
    is_pending_enabled: bool = True
    duration: int | None = None
    color: str = "#3b82f6"
    display_order: int | None = None
    image: str | None = None


class ServiceTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    capacity: int | None = None
    max_concurrent_bookings: int | None = None
    is_pending_enabled: bool | None = None
    duration: int | None = None
    color: str | None = None
    display_order: int | None = None
    image: str | None = None


class ServiceTypeResponse(BaseModel):
    id: UUID
    business_id: UUID
    name: str
    description: str | None = None
    capacity: int
    max_concurrent_bookings: int | None = None
    is_pending_enabled: bool
    duration: int | None = None
    color: str
    display_order: int | None = None
    image: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
