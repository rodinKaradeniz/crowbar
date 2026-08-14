from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import AppBaseModel


class ServiceTypeCreate(AppBaseModel):
    business_id: UUID
    name: str
    description: str | None = None
    capacity: int = 1
    max_concurrent_bookings: int = Field(default=1, ge=1)
    availability_resource_mode: Literal["legacy", "tables", "covers"] = "legacy"
    reservable_cover_capacity: int | None = Field(default=None, ge=1)
    resource_turn_buffer_minutes: int = Field(default=0, ge=0)
    is_pending_enabled: bool = True
    duration: int | None = None
    color: str = "#3b82f6"
    display_order: int | None = None
    image: str | None = None

    @model_validator(mode="after")
    def validate_resource_policy(self):
        if (
            self.availability_resource_mode == "covers"
            and self.reservable_cover_capacity is None
        ):
            raise ValueError("reservable_cover_capacity is required for cover-backed availability")
        if (
            self.availability_resource_mode != "covers"
            and self.reservable_cover_capacity is not None
        ):
            raise ValueError("reservable_cover_capacity is only valid for cover-backed availability")
        return self


class ServiceTypeUpdate(AppBaseModel):
    name: str | None = None
    description: str | None = None
    capacity: int | None = None
    max_concurrent_bookings: int | None = Field(default=None, ge=1)
    availability_resource_mode: Literal["legacy", "tables", "covers"] | None = None
    reservable_cover_capacity: int | None = Field(default=None, ge=1)
    resource_turn_buffer_minutes: int | None = Field(default=None, ge=0)
    is_pending_enabled: bool | None = None
    duration: int | None = None
    color: str | None = None
    display_order: int | None = None
    image: str | None = None

    @model_validator(mode="after")
    def validate_resource_policy(self):
        mode = self.availability_resource_mode
        covers = self.reservable_cover_capacity
        if mode == "covers" and covers is None:
            raise ValueError("reservable_cover_capacity is required for cover-backed availability")
        if mode is not None and mode != "covers" and covers is not None:
            raise ValueError("reservable_cover_capacity is only valid for cover-backed availability")
        return self


class ServiceTypeResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    name: str
    description: str | None = None
    capacity: int
    max_concurrent_bookings: int | None
    availability_resource_mode: Literal["legacy", "tables", "covers"]
    reservable_cover_capacity: int | None
    resource_turn_buffer_minutes: int
    is_pending_enabled: bool
    duration: int | None = None
    color: str
    display_order: int | None = None
    image: str | None = None
    created_at: datetime
    updated_at: datetime
