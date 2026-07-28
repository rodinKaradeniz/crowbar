from datetime import date, time

import pytest
from pydantic import ValidationError

from app.schemas.booking_schedule import (
    BookingScheduleExceptionInput,
    BookingScheduleReplace,
    BookingScheduleWindowInput,
    BookingTimeWindowInput,
)
from app.schemas.service_type import ServiceTypeCreate, ServiceTypeUpdate


def test_schedule_accepts_split_and_overnight_windows():
    schedule = BookingScheduleReplace(
        minimum_notice_minutes=120,
        windows=[
            BookingScheduleWindowInput(
                weekday=4,
                start_time=time(12, 0),
                end_time=time(15, 0),
            ),
            BookingScheduleWindowInput(
                weekday=4,
                start_time=time(18, 0),
                end_time=time(2, 0),
                ends_next_day=True,
            ),
        ],
        exceptions=[
            BookingScheduleExceptionInput(
                local_date=date(2026, 12, 31),
                windows=[
                    BookingTimeWindowInput(
                        start_time=time(20, 0),
                        end_time=time(3, 0),
                        ends_next_day=True,
                    )
                ],
            )
        ],
    )

    assert len(schedule.windows) == 2
    assert schedule.exceptions[0].is_closed is False


@pytest.mark.parametrize(
    ("start_time", "end_time", "ends_next_day"),
    [
        (time(18, 0), time(2, 0), False),
        (time(18, 0), time(22, 0), True),
        (time(18, 0), time(18, 0), True),
    ],
)
def test_window_rejects_inconsistent_range(start_time, end_time, ends_next_day):
    with pytest.raises(ValidationError):
        BookingTimeWindowInput(
            start_time=start_time,
            end_time=end_time,
            ends_next_day=ends_next_day,
        )


def test_closed_exception_rejects_windows():
    with pytest.raises(ValidationError, match="closed exception"):
        BookingScheduleExceptionInput(
            local_date=date(2026, 12, 25),
            is_closed=True,
            windows=[
                BookingTimeWindowInput(
                    start_time=time(18, 0), end_time=time(22, 0)
                )
            ],
        )


def test_custom_hours_exception_requires_a_window():
    with pytest.raises(ValidationError, match="requires at least one window"):
        BookingScheduleExceptionInput(
            local_date=date(2026, 12, 25),
            is_closed=False,
        )


def test_exception_rejects_duplicate_windows():
    duplicate = BookingTimeWindowInput(
        start_time=time(18, 0), end_time=time(22, 0)
    )
    with pytest.raises(ValidationError, match="exception windows must be unique"):
        BookingScheduleExceptionInput(
            local_date=date(2026, 12, 25),
            windows=[duplicate, duplicate],
        )


def test_schedule_rejects_duplicate_windows_and_exception_dates():
    duplicate = BookingScheduleWindowInput(
        weekday=0, start_time=time(18, 0), end_time=time(22, 0)
    )
    with pytest.raises(ValidationError, match="windows must be unique"):
        BookingScheduleReplace(windows=[duplicate, duplicate])

    closed = BookingScheduleExceptionInput(
        local_date=date(2026, 12, 25), is_closed=True
    )
    with pytest.raises(ValidationError, match="unique dates"):
        BookingScheduleReplace(exceptions=[closed, closed])


def test_service_concurrency_defaults_to_one_and_cannot_be_null():
    service = ServiceTypeCreate(
        business_id="00000000-0000-0000-0000-000000000001",
        name="Table",
    )
    assert service.max_concurrent_bookings == 1

    with pytest.raises(ValidationError, match="cannot be null"):
        ServiceTypeUpdate(max_concurrent_bookings=None)
