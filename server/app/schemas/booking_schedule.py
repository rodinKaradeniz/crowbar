from datetime import date, datetime, time
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import AppBaseModel


class BookingTimeWindowInput(AppBaseModel):
    start_time: time
    end_time: time
    ends_next_day: bool = False

    @model_validator(mode="after")
    def validate_range(self):
        if self.start_time == self.end_time:
            raise ValueError("start_time and end_time must be different")
        if self.ends_next_day and self.end_time >= self.start_time:
            raise ValueError(
                "an overnight window must end before its start time"
            )
        if not self.ends_next_day and self.end_time <= self.start_time:
            raise ValueError(
                "a same-day window must end after its start time"
            )
        return self


class BookingScheduleWindowInput(BookingTimeWindowInput):
    weekday: int = Field(ge=0, le=6)


class BookingScheduleExceptionInput(AppBaseModel):
    local_date: date
    is_closed: bool = False
    windows: list[BookingTimeWindowInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_closed_state(self):
        if self.is_closed and self.windows:
            raise ValueError("a closed exception cannot contain windows")
        if not self.is_closed and not self.windows:
            raise ValueError("a custom-hours exception requires at least one window")
        window_keys = [
            (window.start_time, window.end_time, window.ends_next_day)
            for window in self.windows
        ]
        if len(window_keys) != len(set(window_keys)):
            raise ValueError("exception windows must be unique")
        return self


class BookingScheduleReplace(AppBaseModel):
    """Complete replacement contract for a default or service schedule.

    Tenant and optional service scope come from the authenticated route, never
    from this request body.
    """

    minimum_notice_minutes: int = Field(default=0, ge=0)
    advance_booking_days: int = Field(default=30, ge=1)
    slot_interval_minutes: int = Field(default=15, ge=1)
    default_duration_minutes: int = Field(default=60, ge=1)
    cancellation_window_minutes: int = Field(default=120, ge=0)
    arrival_grace_period_minutes: int = Field(default=15, ge=0)
    reminder_enabled: bool = True
    reminder_lead_minutes: int = Field(default=1440, ge=1)
    reconfirmation_enabled: bool = True
    windows: list[BookingScheduleWindowInput] = Field(default_factory=list)
    exceptions: list[BookingScheduleExceptionInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_entries(self):
        window_keys = [
            (
                window.weekday,
                window.start_time,
                window.end_time,
                window.ends_next_day,
            )
            for window in self.windows
        ]
        if len(window_keys) != len(set(window_keys)):
            raise ValueError("schedule windows must be unique")

        exception_dates = [exception.local_date for exception in self.exceptions]
        if len(exception_dates) != len(set(exception_dates)):
            raise ValueError("schedule exceptions must have unique dates")
        return self


class BookingTimeWindowResponse(AppBaseModel):
    id: UUID
    start_time: time
    end_time: time
    ends_next_day: bool
    created_at: datetime
    updated_at: datetime


class BookingScheduleWindowResponse(BookingTimeWindowResponse):
    weekday: int


class BookingScheduleExceptionResponse(AppBaseModel):
    id: UUID
    local_date: date
    is_closed: bool
    windows: list[BookingTimeWindowResponse]
    created_at: datetime
    updated_at: datetime


class BookingScheduleResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    service_type_id: UUID | None
    minimum_notice_minutes: int
    advance_booking_days: int
    slot_interval_minutes: int
    default_duration_minutes: int
    cancellation_window_minutes: int
    arrival_grace_period_minutes: int
    reminder_enabled: bool
    reminder_lead_minutes: int
    reconfirmation_enabled: bool
    windows: list[BookingScheduleWindowResponse]
    exceptions: list[BookingScheduleExceptionResponse]
    created_at: datetime
    updated_at: datetime


class BookingScheduleCollectionResponse(AppBaseModel):
    default_schedule: BookingScheduleResponse
    service_overrides: list[BookingScheduleResponse]


class BookingScheduleOperatingHoursPreview(AppBaseModel):
    current_windows: list[BookingScheduleWindowInput]
    proposed_windows: list[BookingScheduleWindowInput]


class AvailabilitySlotResponse(AppBaseModel):
    starts_at: datetime
    ends_at: datetime


class AvailabilityDateResponse(AppBaseModel):
    date: date
    slots: list[AvailabilitySlotResponse]


class AvailabilityResponse(AppBaseModel):
    business_id: UUID
    service_type_id: UUID
    timezone: str
    duration_minutes: int
    slot_interval_minutes: int
    max_party_size: int
    dates: list[AvailabilityDateResponse]
