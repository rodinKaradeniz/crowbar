from datetime import datetime
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import AppBaseModel


class ServiceTypeCreate(AppBaseModel):
    business_id: UUID
    name: str
    description: str | None = None
    capacity: int = 1
    max_concurrent_bookings: int = Field(default=1, ge=1)
    is_pending_enabled: bool = True
    duration: int | None = None
    color: str = "#3b82f6"
    display_order: int | None = None
    image: str | None = None


class ServiceTypeUpdate(AppBaseModel):
    name: str | None = None
    description: str | None = None
    capacity: int | None = None
    max_concurrent_bookings: int | None = Field(default=None, ge=1)
    is_pending_enabled: bool | None = None
    duration: int | None = None
    color: str | None = None
    display_order: int | None = None
    image: str | None = None

    @model_validator(mode="after")
    def reject_explicit_null_concurrency(self):
        if (
            "max_concurrent_bookings" in self.model_fields_set
            and self.max_concurrent_bookings is None
        ):
            raise ValueError("max_concurrent_bookings cannot be null")
        return self


class ServiceTypeResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    name: str
    description: str | None = None
    capacity: int
    max_concurrent_bookings: int
    is_pending_enabled: bool
    duration: int | None = None
    color: str
    display_order: int | None = None
    image: str | None = None
    created_at: datetime
    updated_at: datetime
