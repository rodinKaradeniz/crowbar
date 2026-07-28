from datetime import datetime, time, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.booking_schedule import (
    BookingSchedule,
    BookingScheduleException,
    BookingScheduleExceptionWindow,
    BookingScheduleWindow,
)
from app.models.business import Business
from app.models.service_type import ServiceType
from app.schemas.booking_schedule import (
    BookingScheduleExceptionInput,
    BookingScheduleOperatingHoursPreview,
    BookingScheduleReplace,
    BookingScheduleWindowInput,
)


DAY_INDEX = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def _parse_wall_time(value: object) -> time | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = time.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        return None
    return parsed.replace(microsecond=0)


def windows_from_operating_hours(
    operating_hours: object,
) -> list[BookingScheduleWindow]:
    if not isinstance(operating_hours, dict):
        return []

    windows: list[BookingScheduleWindow] = []
    for day_name, raw_entry in operating_hours.items():
        weekday = DAY_INDEX.get(str(day_name).casefold())
        if weekday is None or not isinstance(raw_entry, dict):
            continue
        if raw_entry.get("closed") is True:
            continue

        start_time = _parse_wall_time(raw_entry.get("open"))
        end_time = _parse_wall_time(raw_entry.get("close"))
        if start_time is None or end_time is None or start_time == end_time:
            continue

        windows.append(
            BookingScheduleWindow(
                weekday=weekday,
                start_time=start_time,
                end_time=end_time,
                ends_next_day=end_time < start_time,
            )
        )
    return windows


async def create_default_booking_schedule(
    db: AsyncSession,
    business: Business,
) -> BookingSchedule:
    """Create the closed-by-default booking policy for a newly created tenant."""
    schedule = BookingSchedule(
        business_id=business.id,
        minimum_notice_minutes=0,
        advance_booking_days=max(business.advance_booking_days or 30, 1),
        slot_interval_minutes=max(business.time_slot_interval or 15, 1),
        default_duration_minutes=max(business.reservation_time or 60, 1),
        windows=windows_from_operating_hours(business.operating_hours),
    )
    db.add(schedule)
    await db.flush()
    return schedule


def _schedule_options():
    return (
        selectinload(BookingSchedule.windows),
        selectinload(BookingSchedule.exceptions).selectinload(
            BookingScheduleException.windows
        ),
    )


async def list_booking_schedules(
    db: AsyncSession,
    business_id: UUID,
) -> list[BookingSchedule]:
    result = await db.execute(
        select(BookingSchedule)
        .where(BookingSchedule.business_id == business_id)
        .options(*_schedule_options())
        .order_by(BookingSchedule.service_type_id.asc().nulls_first())
    )
    return list(result.scalars().all())


async def get_default_schedule(
    db: AsyncSession,
    business_id: UUID,
) -> BookingSchedule | None:
    return await db.scalar(
        select(BookingSchedule)
        .where(
            BookingSchedule.business_id == business_id,
            BookingSchedule.service_type_id.is_(None),
        )
        .options(*_schedule_options())
    )


async def _get_service_type(
    db: AsyncSession,
    *,
    business_id: UUID,
    service_type_id: UUID,
) -> ServiceType | None:
    return await db.scalar(
        select(ServiceType).where(
            ServiceType.id == service_type_id,
            ServiceType.business_id == business_id,
        )
    )


async def _get_service_schedule(
    db: AsyncSession,
    *,
    business_id: UUID,
    service_type_id: UUID,
) -> BookingSchedule | None:
    return await db.scalar(
        select(BookingSchedule)
        .where(
            BookingSchedule.business_id == business_id,
            BookingSchedule.service_type_id == service_type_id,
        )
        .options(*_schedule_options())
    )


def _window_from_input(window: BookingScheduleWindowInput) -> BookingScheduleWindow:
    return BookingScheduleWindow(
        weekday=window.weekday,
        start_time=window.start_time,
        end_time=window.end_time,
        ends_next_day=window.ends_next_day,
    )


def _exception_from_input(
    exception: BookingScheduleExceptionInput,
) -> BookingScheduleException:
    return BookingScheduleException(
        local_date=exception.local_date,
        is_closed=exception.is_closed,
        windows=[
            BookingScheduleExceptionWindow(
                start_time=window.start_time,
                end_time=window.end_time,
                ends_next_day=window.ends_next_day,
            )
            for window in exception.windows
        ],
    )


async def _replace_schedule(
    db: AsyncSession,
    *,
    schedule: BookingSchedule,
    data: BookingScheduleReplace,
) -> BookingSchedule:
    schedule.minimum_notice_minutes = data.minimum_notice_minutes
    schedule.advance_booking_days = data.advance_booking_days
    schedule.slot_interval_minutes = data.slot_interval_minutes
    schedule.default_duration_minutes = data.default_duration_minutes
    schedule.windows = [_window_from_input(window) for window in data.windows]
    schedule.exceptions = [
        _exception_from_input(exception) for exception in data.exceptions
    ]
    schedule.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return schedule


async def replace_default_schedule(
    db: AsyncSession,
    *,
    business_id: UUID,
    data: BookingScheduleReplace,
) -> BookingSchedule | None:
    schedule = await get_default_schedule(db, business_id)
    if schedule is None:
        return None
    return await _replace_schedule(db, schedule=schedule, data=data)


async def replace_service_schedule(
    db: AsyncSession,
    *,
    business_id: UUID,
    service_type_id: UUID,
    data: BookingScheduleReplace,
) -> BookingSchedule | None:
    if (
        await _get_service_type(
            db,
            business_id=business_id,
            service_type_id=service_type_id,
        )
        is None
    ):
        return None

    schedule = await _get_service_schedule(
        db,
        business_id=business_id,
        service_type_id=service_type_id,
    )
    if schedule is None:
        schedule = BookingSchedule(
            business_id=business_id,
            service_type_id=service_type_id,
        )
        db.add(schedule)
    return await _replace_schedule(db, schedule=schedule, data=data)


async def delete_service_schedule(
    db: AsyncSession,
    *,
    business_id: UUID,
    service_type_id: UUID,
) -> bool:
    if (
        await _get_service_type(
            db,
            business_id=business_id,
            service_type_id=service_type_id,
        )
        is None
    ):
        return False
    schedule = await _get_service_schedule(
        db,
        business_id=business_id,
        service_type_id=service_type_id,
    )
    if schedule is None:
        return True
    await db.delete(schedule)
    await db.flush()
    return True


def _window_input(window: BookingScheduleWindow) -> BookingScheduleWindowInput:
    return BookingScheduleWindowInput(
        weekday=window.weekday,
        start_time=window.start_time,
        end_time=window.end_time,
        ends_next_day=window.ends_next_day,
    )


async def preview_operating_hours_copy(
    db: AsyncSession,
    *,
    business: Business,
) -> BookingScheduleOperatingHoursPreview | None:
    schedule = await get_default_schedule(db, business.id)
    if schedule is None:
        return None
    proposed = windows_from_operating_hours(business.operating_hours)
    return BookingScheduleOperatingHoursPreview(
        current_windows=[_window_input(window) for window in schedule.windows],
        proposed_windows=[_window_input(window) for window in proposed],
    )


async def copy_operating_hours_to_default(
    db: AsyncSession,
    *,
    business: Business,
) -> BookingSchedule | None:
    schedule = await get_default_schedule(db, business.id)
    if schedule is None:
        return None
    schedule.windows = windows_from_operating_hours(business.operating_hours)
    schedule.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return schedule
