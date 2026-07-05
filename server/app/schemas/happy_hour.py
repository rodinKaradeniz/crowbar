from datetime import time
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import AppBaseModel


def _validate_days(days: list[int]) -> list[int]:
    for d in days:
        if d < 0 or d > 6:
            raise ValueError("days_of_week entries must be 0..6 (0=Monday..6=Sunday)")
    return days


class HappyHourWindowCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    days_of_week: list[int] = Field(..., min_length=1)
    start_time: time
    end_time: time
    is_active: bool = True

    @field_validator("days_of_week")
    @classmethod
    def check_days(cls, v: list[int]) -> list[int]:
        return _validate_days(v)


class HappyHourWindowUpdate(AppBaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    days_of_week: list[int] | None = Field(None, min_length=1)
    start_time: time | None = None
    end_time: time | None = None
    is_active: bool | None = None

    @field_validator("days_of_week")
    @classmethod
    def check_days(cls, v: list[int] | None) -> list[int] | None:
        return _validate_days(v) if v is not None else v


class HappyHourWindowResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    name: str
    days_of_week: list[int]
    start_time: time
    end_time: time
    is_active: bool

