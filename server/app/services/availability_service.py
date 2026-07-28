from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import ErrorCode
from app.models.booking_schedule import (
    BookingSchedule,
    BookingScheduleException,
    BookingScheduleExceptionWindow,
    BookingScheduleWindow,
)
from app.models.business import Business
from app.models.reservation import Reservation
from app.models.service_type import ServiceType
from app.schemas.booking_schedule import (
    AvailabilityDateResponse,
    AvailabilityResponse,
    AvailabilitySlotResponse,
)


ACTIVE_CAPACITY_STATUSES = ("pending", "confirmed")
MAX_AVAILABILITY_DAYS = 31
ALTERNATIVE_SEARCH_DAYS = 7
ALTERNATIVE_LIMIT = 5


class AvailabilityError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


@dataclass(frozen=True)
class AvailabilityContext:
    business: Business
    service_type: ServiceType
    schedule: BookingSchedule
    timezone: ZoneInfo
    duration_minutes: int
    max_party_size: int


@dataclass(frozen=True)
class ValidatedBookingSlot:
    starts_at: datetime
    ends_at: datetime
    business: Business
    service_type: ServiceType


@dataclass(frozen=True)
class _Window:
    start_time: time
    end_time: time
    ends_next_day: bool


def _schedule_options():
    return (
        selectinload(BookingSchedule.windows),
        selectinload(BookingSchedule.exceptions).selectinload(
            BookingScheduleException.windows
        ),
    )


async def _load_context(
    db: AsyncSession,
    *,
    business_id: UUID,
    service_type_id: UUID,
    lock_schedule: bool,
) -> AvailabilityContext:
    business = await db.scalar(
        select(Business).where(Business.id == business_id)
    )
    if business is None:
        raise AvailabilityError(
            status_code=404,
            code=ErrorCode.NOT_FOUND,
            message="Business not found",
        )
    if "reservations" not in (business.enabled_modules or []):
        raise AvailabilityError(
            status_code=403,
            code=ErrorCode.MODULE_DISABLED,
            message="The reservations module is not enabled for this business",
            details={"module": "reservations"},
        )

    service_type = await db.scalar(
        select(ServiceType).where(
            ServiceType.id == service_type_id,
            ServiceType.business_id == business_id,
        )
    )
    if service_type is None:
        raise AvailabilityError(
            status_code=404,
            code=ErrorCode.NOT_FOUND,
            message="Service type not found",
        )

    schedule_query = (
        select(BookingSchedule)
        .where(
            BookingSchedule.business_id == business_id,
            BookingSchedule.service_type_id == service_type_id,
        )
        .options(*_schedule_options())
    )
    if lock_schedule:
        schedule_query = schedule_query.with_for_update()
    schedule = await db.scalar(schedule_query)

    if schedule is None:
        schedule_query = (
            select(BookingSchedule)
            .where(
                BookingSchedule.business_id == business_id,
                BookingSchedule.service_type_id.is_(None),
            )
            .options(*_schedule_options())
        )
        if lock_schedule:
            schedule_query = schedule_query.with_for_update()
        schedule = await db.scalar(schedule_query)

    if schedule is None:
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.BOOKING_UNAVAILABLE,
            message="Booking availability has not been configured",
        )

    try:
        business_timezone = ZoneInfo(business.timezone)
    except (ValueError, ZoneInfoNotFoundError) as exc:
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.BOOKING_UNAVAILABLE,
            message="Booking availability is temporarily unavailable",
        ) from exc

    configured_duration = (
        service_type.duration
        if service_type.duration is not None
        else schedule.default_duration_minutes
    )
    duration_minutes = max(configured_duration, 1)
    max_party_size = max(min(business.max_guests, service_type.capacity), 0)
    return AvailabilityContext(
        business=business,
        service_type=service_type,
        schedule=schedule,
        timezone=business_timezone,
        duration_minutes=duration_minutes,
        max_party_size=max_party_size,
    )


def _validate_party_size(context: AvailabilityContext, guests: int) -> None:
    if context.max_party_size < 1:
        raise AvailabilityError(
            status_code=422,
            code=ErrorCode.PARTY_SIZE_EXCEEDED,
            message="This service is not configured to accept guests",
            details={"max_party_size": 0},
        )
    if guests < 1 or guests > context.max_party_size:
        raise AvailabilityError(
            status_code=422,
            code=ErrorCode.PARTY_SIZE_EXCEEDED,
            message=f"Party size must be between 1 and {context.max_party_size}",
            details={"max_party_size": context.max_party_size},
        )


def _windows_for_service_date(
    schedule: BookingSchedule,
    service_date: date,
) -> list[_Window]:
    exception = next(
        (
            item
            for item in schedule.exceptions
            if item.local_date == service_date
        ),
        None,
    )
    if exception is not None:
        if exception.is_closed:
            return []
        return [
            _Window(window.start_time, window.end_time, window.ends_next_day)
            for window in exception.windows
        ]

    return [
        _Window(window.start_time, window.end_time, window.ends_next_day)
        for window in schedule.windows
        if window.weekday == service_date.weekday()
    ]


def _candidate_slots(
    context: AvailabilityContext,
    *,
    start_date: date,
    days: int,
    now: datetime,
) -> list[AvailabilitySlotResponse]:
    end_date = start_date + timedelta(days=days - 1)
    local_now = now.astimezone(context.timezone)
    earliest_start = now.astimezone(timezone.utc) + timedelta(
        minutes=context.schedule.minimum_notice_minutes
    )
    latest_local_date = local_now.date() + timedelta(
        days=context.schedule.advance_booking_days
    )
    slots: list[AvailabilitySlotResponse] = []

    # Start one service date earlier so an overnight window can contribute
    # early-morning slots to the first requested calendar date.
    service_date = start_date - timedelta(days=1)
    while service_date <= end_date:
        for window in _windows_for_service_date(context.schedule, service_date):
            local_start = datetime.combine(
                service_date, window.start_time, context.timezone
            )
            local_end_date = service_date + timedelta(
                days=1 if window.ends_next_day else 0
            )
            local_end = datetime.combine(
                local_end_date, window.end_time, context.timezone
            )

            cursor = local_start.astimezone(timezone.utc)
            boundary = local_end.astimezone(timezone.utc)
            while cursor < boundary:
                local_cursor = cursor.astimezone(context.timezone)
                cursor_date = local_cursor.date()
                if (
                    start_date <= cursor_date <= end_date
                    and local_now.date() <= cursor_date <= latest_local_date
                    and cursor >= earliest_start
                ):
                    slots.append(
                        AvailabilitySlotResponse(
                            starts_at=local_cursor,
                            ends_at=(
                                cursor
                                + timedelta(minutes=context.duration_minutes)
                            ).astimezone(context.timezone),
                        )
                    )
                cursor += timedelta(
                    minutes=context.schedule.slot_interval_minutes
                )
        service_date += timedelta(days=1)

    unique_slots = {slot.starts_at.astimezone(timezone.utc): slot for slot in slots}
    return [unique_slots[key] for key in sorted(unique_slots)]


async def _remove_occupied_slots(
    db: AsyncSession,
    *,
    context: AvailabilityContext,
    slots: list[AvailabilitySlotResponse],
    exclude_reservation_id: UUID | None,
) -> list[AvailabilitySlotResponse]:
    if not slots:
        return []

    first_start = min(slot.starts_at for slot in slots)
    last_end = max(slot.ends_at for slot in slots)
    query = select(Reservation.time, Reservation.ends_at).where(
        Reservation.business_id == context.business.id,
        Reservation.service_type_id == context.service_type.id,
        Reservation.status.in_(ACTIVE_CAPACITY_STATUSES),
        Reservation.time < last_end,
        Reservation.ends_at > first_start,
    )
    if exclude_reservation_id is not None:
        query = query.where(Reservation.id != exclude_reservation_id)
    occupied = list((await db.execute(query)).all())

    available: list[AvailabilitySlotResponse] = []
    for slot in slots:
        overlap_count = sum(
            1
            for reservation_start, reservation_end in occupied
            if reservation_start < slot.ends_at
            and reservation_end > slot.starts_at
        )
        if overlap_count < context.service_type.max_concurrent_bookings:
            available.append(slot)
    return available


async def _availability_for_context(
    db: AsyncSession,
    *,
    context: AvailabilityContext,
    start_date: date,
    days: int,
    guests: int,
    now: datetime,
    exclude_reservation_id: UUID | None,
) -> AvailabilityResponse:
    _validate_party_size(context, guests)
    if days < 1 or days > MAX_AVAILABILITY_DAYS:
        raise ValueError(f"days must be between 1 and {MAX_AVAILABILITY_DAYS}")

    candidates = _candidate_slots(
        context,
        start_date=start_date,
        days=days,
        now=now,
    )
    available = await _remove_occupied_slots(
        db,
        context=context,
        slots=candidates,
        exclude_reservation_id=exclude_reservation_id,
    )
    by_date: dict[date, list[AvailabilitySlotResponse]] = {
        start_date + timedelta(days=offset): [] for offset in range(days)
    }
    for slot in available:
        by_date[slot.starts_at.astimezone(context.timezone).date()].append(slot)

    return AvailabilityResponse(
        business_id=context.business.id,
        service_type_id=context.service_type.id,
        timezone=context.business.timezone,
        duration_minutes=context.duration_minutes,
        slot_interval_minutes=context.schedule.slot_interval_minutes,
        max_party_size=context.max_party_size,
        dates=[
            AvailabilityDateResponse(date=local_date, slots=by_date[local_date])
            for local_date in sorted(by_date)
        ],
    )


async def get_availability(
    db: AsyncSession,
    *,
    business_id: UUID,
    service_type_id: UUID,
    start_date: date,
    days: int,
    guests: int,
    now: datetime | None = None,
    exclude_reservation_id: UUID | None = None,
) -> AvailabilityResponse:
    context = await _load_context(
        db,
        business_id=business_id,
        service_type_id=service_type_id,
        lock_schedule=False,
    )
    return await _availability_for_context(
        db,
        context=context,
        start_date=start_date,
        days=days,
        guests=guests,
        now=now or datetime.now(timezone.utc),
        exclude_reservation_id=exclude_reservation_id,
    )


async def validate_booking_slot(
    db: AsyncSession,
    *,
    business_id: UUID,
    service_type_id: UUID,
    starts_at: datetime,
    guests: int,
    now: datetime | None = None,
    exclude_reservation_id: UUID | None = None,
) -> ValidatedBookingSlot:
    """Lock the capacity boundary and validate one exact server-produced slot."""
    context = await _load_context(
        db,
        business_id=business_id,
        service_type_id=service_type_id,
        lock_schedule=True,
    )
    _validate_party_size(context, guests)

    if starts_at.tzinfo is None:
        local_start = starts_at.replace(tzinfo=context.timezone)
    else:
        local_start = starts_at.astimezone(context.timezone)

    availability = await _availability_for_context(
        db,
        context=context,
        start_date=local_start.date(),
        days=ALTERNATIVE_SEARCH_DAYS,
        guests=guests,
        now=now or datetime.now(timezone.utc),
        exclude_reservation_id=exclude_reservation_id,
    )
    requested_utc = local_start.astimezone(timezone.utc)
    all_slots = [slot for item in availability.dates for slot in item.slots]
    selected = next(
        (
            slot
            for slot in all_slots
            if slot.starts_at.astimezone(timezone.utc) == requested_utc
        ),
        None,
    )
    if selected is None:
        alternatives = sorted(
            all_slots,
            key=lambda slot: abs(
                (slot.starts_at.astimezone(timezone.utc) - requested_utc)
                .total_seconds()
            ),
        )[:ALTERNATIVE_LIMIT]
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.SLOT_UNAVAILABLE,
            message="That reservation time is no longer available",
            details={
                "alternatives": [
                    alternative.model_dump(mode="json")
                    for alternative in alternatives
                ]
            },
        )

    return ValidatedBookingSlot(
        starts_at=selected.starts_at,
        ends_at=selected.ends_at,
        business=context.business,
        service_type=context.service_type,
    )
