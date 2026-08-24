from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import ErrorCode
from app.core.public_access import has_required_privacy_contact
from app.models.booking_schedule import (
    BookingSchedule,
    BookingScheduleException,
    BookingScheduleExceptionWindow,
    BookingScheduleWindow,
)
from app.models.business import Business
from app.models.reservation import Reservation
from app.models.service_type import ServiceType
from app.models.table import Table
from app.models.table_assignment import ReservationTableAssignment
from app.models.table_combination import TableCombination
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
    table_ids: tuple[UUID, ...] = ()


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


def _override_slots_for_date(
    context: AvailabilityContext,
    *,
    local_date: date,
    now: datetime,
) -> list[AvailabilitySlotResponse]:
    """Return every future interval-aligned wall time for an override date.

    These candidates deliberately ignore schedule windows, exceptions, notice,
    horizon, and occupancy. Generating them server-side keeps DST handling and
    venue-timezone interpretation authoritative.
    """
    local_start = datetime.combine(local_date, time.min, context.timezone)
    local_end = datetime.combine(
        local_date + timedelta(days=1), time.min, context.timezone
    )
    cursor = local_start.astimezone(timezone.utc)
    boundary = local_end.astimezone(timezone.utc)
    slots: list[AvailabilitySlotResponse] = []
    while cursor < boundary:
        if cursor > now.astimezone(timezone.utc):
            local_cursor = cursor.astimezone(context.timezone)
            slots.append(
                AvailabilitySlotResponse(
                    starts_at=local_cursor,
                    ends_at=(
                        cursor + timedelta(minutes=context.duration_minutes)
                    ).astimezone(context.timezone),
                )
            )
        cursor += timedelta(minutes=context.schedule.slot_interval_minutes)
    return slots


def _resource_intervals_overlap(
    *,
    starts_at: datetime,
    ends_at: datetime,
    buffer_minutes: int,
    other_starts_at: datetime,
    other_ends_at: datetime,
    other_buffer_minutes: int,
) -> bool:
    return (
        other_starts_at < ends_at + timedelta(minutes=buffer_minutes)
        and other_ends_at + timedelta(minutes=other_buffer_minutes) > starts_at
    )


async def _active_service_reservations(
    db: AsyncSession,
    *,
    context: AvailabilityContext,
    exclude_reservation_id: UUID | None,
) -> list[Reservation]:
    query = select(Reservation).where(
        Reservation.business_id == context.business.id,
        Reservation.service_type_id == context.service_type.id,
        Reservation.status.in_(ACTIVE_CAPACITY_STATUSES),
    )
    if exclude_reservation_id is not None:
        query = query.where(Reservation.id != exclude_reservation_id)
    return list((await db.execute(query)).scalars().all())


async def _table_candidates(
    db: AsyncSession, *, business_id: UUID, lock: bool = False
) -> list[tuple[tuple[Table, ...], int]]:
    table_query = select(Table).where(
        Table.business_id == business_id,
        Table.is_active.is_(True),
        Table.deleted_at.is_(None),
    )
    if lock:
        table_query = table_query.order_by(Table.id).with_for_update()
    tables = list((await db.execute(table_query)).scalars().all())
    by_id = {table.id: table for table in tables}
    candidates: dict[tuple[UUID, ...], tuple[tuple[Table, ...], int]] = {
        (table.id,): ((table,), table.capacity) for table in tables
    }
    combinations = list(
        (
            await db.execute(
                select(TableCombination).where(
                    TableCombination.business_id == business_id,
                    TableCombination.is_active.is_(True),
                ).options(selectinload(TableCombination.members))
            )
        ).scalars().unique()
    )
    for combination in combinations:
        members = tuple(
            sorted(
                (by_id[member.table_id] for member in combination.members if member.table_id in by_id),
                key=lambda table: (table.label, str(table.id)),
            )
        )
        if len(members) != len(combination.members):
            continue
        table_ids = tuple(table.id for table in members)
        candidates[table_ids] = (
            members,
            combination.capacity_override or sum(table.capacity for table in members),
        )
    return sorted(
        candidates.values(),
        key=lambda candidate: (
            candidate[1],
            len(candidate[0]),
            tuple((table.label, str(table.id)) for table in candidate[0]),
        ),
    )


async def _table_reservation_rows(
    db: AsyncSession, *, business_id: UUID, exclude_reservation_id: UUID | None
) -> list[tuple[UUID, UUID, datetime, datetime, int]]:
    query = (
        select(
            ReservationTableAssignment.reservation_id,
            ReservationTableAssignment.table_id,
            Reservation.time,
            Reservation.ends_at,
            ServiceType.resource_turn_buffer_minutes,
        )
        .join(Reservation, Reservation.id == ReservationTableAssignment.reservation_id)
        .join(ServiceType, ServiceType.id == Reservation.service_type_id)
        .where(
            Reservation.business_id == business_id,
            Reservation.status.in_(ACTIVE_CAPACITY_STATUSES),
        )
    )
    if exclude_reservation_id is not None:
        query = query.where(Reservation.id != exclude_reservation_id)
    return list((await db.execute(query)).all())


def _select_table_candidate(
    *,
    candidates: list[tuple[tuple[Table, ...], int]],
    assignments: list[tuple[UUID, UUID, datetime, datetime, int]],
    starts_at: datetime,
    ends_at: datetime,
    guests: int,
    buffer_minutes: int,
) -> tuple[UUID, ...] | None:
    for tables, capacity in candidates:
        if capacity < guests:
            continue
        if any(
            table.operational_state == "out_of_service"
            and (
                table.operational_state_until is None
                or table.operational_state_until > starts_at
            )
            for table in tables
        ):
            continue
        table_ids = {table.id for table in tables}
        if any(
            table_id in table_ids
            and _resource_intervals_overlap(
                starts_at=starts_at,
                ends_at=ends_at,
                buffer_minutes=buffer_minutes,
                other_starts_at=other_starts_at,
                other_ends_at=other_ends_at,
                other_buffer_minutes=other_buffer,
            )
            for _, table_id, other_starts_at, other_ends_at, other_buffer in assignments
        ):
            continue
        return tuple(table.id for table in tables)
    return None


def _has_concurrency_guard(
    *,
    reservations: list[Reservation],
    slot: AvailabilitySlotResponse,
    context: AvailabilityContext,
) -> bool:
    guard = context.service_type.max_concurrent_bookings
    if guard is None:
        return True
    overlap_count = sum(
        1
        for reservation in reservations
        if _resource_intervals_overlap(
            starts_at=slot.starts_at,
            ends_at=slot.ends_at,
            buffer_minutes=context.service_type.resource_turn_buffer_minutes,
            other_starts_at=reservation.time,
            other_ends_at=reservation.ends_at,
            other_buffer_minutes=context.service_type.resource_turn_buffer_minutes,
        )
    )
    return overlap_count < guard


async def _remove_occupied_slots(
    db: AsyncSession,
    *,
    context: AvailabilityContext,
    slots: list[AvailabilitySlotResponse],
    guests: int,
    exclude_reservation_id: UUID | None,
) -> list[AvailabilitySlotResponse]:
    if not slots:
        return []

    active_reservations = await _active_service_reservations(
        db, context=context, exclude_reservation_id=exclude_reservation_id
    )
    mode = context.service_type.availability_resource_mode
    if mode == "legacy":
        return [
            slot
            for slot in slots
            if _has_concurrency_guard(
                reservations=active_reservations, slot=slot, context=context
            )
        ]

    if mode == "covers":
        capacity = context.service_type.reservable_cover_capacity
        if capacity is None:
            return []
        available: list[AvailabilitySlotResponse] = []
        for slot in slots:
            occupied_covers = sum(
                reservation.guests
                for reservation in active_reservations
                if _resource_intervals_overlap(
                    starts_at=slot.starts_at,
                    ends_at=slot.ends_at,
                    buffer_minutes=context.service_type.resource_turn_buffer_minutes,
                    other_starts_at=reservation.time,
                    other_ends_at=reservation.ends_at,
                    other_buffer_minutes=context.service_type.resource_turn_buffer_minutes,
                )
            )
            if (
                occupied_covers + guests <= capacity
                and _has_concurrency_guard(
                    reservations=active_reservations, slot=slot, context=context
                )
            ):
                available.append(slot)
        return available

    candidates = await _table_candidates(db, business_id=context.business.id)
    assignments = await _table_reservation_rows(
        db, business_id=context.business.id, exclude_reservation_id=exclude_reservation_id
    )
    return [
        slot
        for slot in slots
        if _select_table_candidate(
            candidates=candidates,
            assignments=assignments,
            starts_at=slot.starts_at,
            ends_at=slot.ends_at,
            guests=guests,
            buffer_minutes=context.service_type.resource_turn_buffer_minutes,
        )
        is not None
        and _has_concurrency_guard(
            reservations=active_reservations, slot=slot, context=context
        )
    ]

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
        guests=guests,
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


async def ensure_public_booking_access(
    db: AsyncSession, *, business_id: UUID
) -> None:
    """Reject public booking requests without affecting staff booking tools."""
    business = await db.scalar(select(Business).where(Business.id == business_id))
    if business is None:
        raise AvailabilityError(
            status_code=404,
            code=ErrorCode.NOT_FOUND,
            message="Business not found",
        )
    if not has_required_privacy_contact(business):
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
    if not business.public_reservations_enabled:
        raise AvailabilityError(
            status_code=403,
            code=ErrorCode.PUBLIC_RESERVATIONS_DISABLED,
            message="Online reservations are not available for this venue",
        )


async def get_override_times(
    db: AsyncSession,
    *,
    business_id: UUID,
    service_type_id: UUID,
    local_date: date,
    guests: int,
    now: datetime | None = None,
) -> AvailabilityResponse:
    context = await _load_context(
        db,
        business_id=business_id,
        service_type_id=service_type_id,
        lock_schedule=False,
    )
    _validate_party_size(context, guests)
    slots = _override_slots_for_date(
        context,
        local_date=local_date,
        now=now or datetime.now(timezone.utc),
    )
    return AvailabilityResponse(
        business_id=context.business.id,
        service_type_id=context.service_type.id,
        timezone=context.business.timezone,
        duration_minutes=context.duration_minutes,
        slot_interval_minutes=context.schedule.slot_interval_minutes,
        max_party_size=context.max_party_size,
        dates=[AvailabilityDateResponse(date=local_date, slots=slots)],
    )


async def validate_override_slot(
    db: AsyncSession,
    *,
    business_id: UUID,
    service_type_id: UUID,
    starts_at: datetime,
    guests: int,
    now: datetime | None = None,
) -> ValidatedBookingSlot:
    context = await _load_context(
        db,
        business_id=business_id,
        service_type_id=service_type_id,
        lock_schedule=True,
    )
    _validate_party_size(context, guests)
    current_time = now or datetime.now(timezone.utc)
    local_start = (
        starts_at.replace(tzinfo=context.timezone)
        if starts_at.tzinfo is None
        else starts_at.astimezone(context.timezone)
    )
    candidates = _override_slots_for_date(
        context,
        local_date=local_start.date(),
        now=current_time,
    )
    requested_utc = local_start.astimezone(timezone.utc)
    selected = next(
        (
            slot
            for slot in candidates
            if slot.starts_at.astimezone(timezone.utc) == requested_utc
        ),
        None,
    )
    if selected is None:
        raise AvailabilityError(
            status_code=422,
            code=ErrorCode.AVAILABILITY_OVERRIDE_INVALID,
            message=(
                "Override time must be in the future and aligned to the "
                "booking interval"
            ),
        )
    return ValidatedBookingSlot(
        starts_at=selected.starts_at,
        ends_at=selected.ends_at,
        business=context.business,
        service_type=context.service_type,
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

    table_ids: tuple[UUID, ...] = ()
    if context.service_type.availability_resource_mode == "tables":
        # Lock the physical resources in a stable order, then choose again from
        # committed state. This turns a previously displayed slot into one
        # atomic claim instead of trusting the read-time projection.
        candidates = await _table_candidates(
            db, business_id=business_id, lock=True
        )
        assignments = await _table_reservation_rows(
            db,
            business_id=business_id,
            exclude_reservation_id=exclude_reservation_id,
        )
        table_ids = _select_table_candidate(
            candidates=candidates,
            assignments=assignments,
            starts_at=selected.starts_at,
            ends_at=selected.ends_at,
            guests=guests,
            buffer_minutes=context.service_type.resource_turn_buffer_minutes,
        ) or ()
        if not table_ids:
            alternatives = [
                slot.model_dump(mode="json")
                for slot in all_slots
                if slot.starts_at != selected.starts_at
            ][:ALTERNATIVE_LIMIT]
            raise AvailabilityError(
                status_code=409,
                code=ErrorCode.SLOT_UNAVAILABLE,
                message="That reservation time is no longer available",
                details={"alternatives": alternatives},
            )

    return ValidatedBookingSlot(
        starts_at=selected.starts_at,
        ends_at=selected.ends_at,
        business=context.business,
        service_type=context.service_type,
        table_ids=table_ids,
    )
