import asyncio
from datetime import date, datetime, time, timedelta, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking_schedule import (
    BookingSchedule,
    BookingScheduleException,
    BookingScheduleExceptionWindow,
    BookingScheduleWindow,
)
from app.models.business import Business
from app.models.customer import Customer
from app.models.reservation import Reservation
from app.models.service_type import ServiceType
from app.schemas.reservation import PublicReservationCreate
from app.services import availability_service, reservation_service
from app.services.availability_service import AvailabilityError
from tests.conftest import TestSessionLocal


async def _create_context(
    db: AsyncSession,
    *,
    timezone_name: str = "America/New_York",
    max_concurrent_bookings: int = 1,
) -> tuple[Business, ServiceType, BookingSchedule]:
    business = Business(
        name="Availability Bar",
        slug="availability-bar",
        email="availability@example.com",
        phone="+14155550000",
        timezone=timezone_name,
        max_guests=8,
    )
    db.add(business)
    await db.flush()
    service_type = ServiceType(
        business_id=business.id,
        name="Table",
        capacity=6,
        max_concurrent_bookings=max_concurrent_bookings,
        duration=90,
    )
    db.add(service_type)
    await db.flush()
    schedule = BookingSchedule(
        business_id=business.id,
        minimum_notice_minutes=60,
        advance_booking_days=30,
        slot_interval_minutes=30,
        default_duration_minutes=60,
    )
    db.add(schedule)
    await db.flush()
    return business, service_type, schedule


@pytest.mark.asyncio
async def test_availability_uses_business_timezone_and_start_time_windows(
    db_session: AsyncSession,
):
    business, service_type, schedule = await _create_context(db_session)
    db_session.add_all([
        BookingScheduleWindow(
            schedule_id=schedule.id,
            weekday=0,
            start_time=time(18, 0),
            end_time=time(20, 0),
        )
    ])
    await db_session.flush()

    response = await availability_service.get_availability(
        db_session,
        business_id=business.id,
        service_type_id=service_type.id,
        start_date=date(2026, 1, 5),  # Monday
        days=1,
        guests=4,
        now=datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc),
    )

    assert [slot.starts_at.hour for slot in response.dates[0].slots] == [
        18,
        18,
        19,
        19,
    ]
    assert [slot.starts_at.minute for slot in response.dates[0].slots] == [
        0,
        30,
        0,
        30,
    ]
    # The 19:30 start is valid even though its 90-minute occupancy extends
    # beyond the 20:00 start-time boundary.
    assert response.dates[0].slots[-1].ends_at.hour == 21
    assert response.timezone == "America/New_York"
    assert response.max_party_size == 6


@pytest.mark.asyncio
async def test_pending_reservation_consumes_overlap_capacity(
    db_session: AsyncSession,
):
    business, service_type, schedule = await _create_context(db_session)
    db_session.add_all([
        BookingScheduleWindow(
            schedule_id=schedule.id,
            weekday=0,
            start_time=time(18, 0),
            end_time=time(21, 0),
        )
    ])
    customer = Customer(
        business_id=business.id,
        name="Existing Guest",
        phone="+14155550001",
        email="existing@example.com",
    )
    db_session.add(customer)
    await db_session.flush()
    starts_at = datetime(2026, 1, 5, 18, 0, tzinfo=timezone(timedelta(hours=-5)))
    db_session.add(
        Reservation(
            business_id=business.id,
            customer_id=customer.id,
            service_type_id=service_type.id,
            time=starts_at,
            ends_at=starts_at + timedelta(minutes=90),
            phone=customer.phone,
            email=customer.email,
            status="pending",
            guests=2,
        )
    )
    await db_session.flush()

    response = await availability_service.get_availability(
        db_session,
        business_id=business.id,
        service_type_id=service_type.id,
        start_date=date(2026, 1, 5),
        days=1,
        guests=2,
        now=datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc),
    )

    assert [slot.starts_at.strftime("%H:%M") for slot in response.dates[0].slots] == [
        "19:30",
        "20:00",
        "20:30",
    ]


@pytest.mark.asyncio
async def test_cancelled_reservation_releases_capacity(
    db_session: AsyncSession,
):
    business, service_type, schedule = await _create_context(db_session)
    db_session.add(
        BookingScheduleWindow(
            schedule_id=schedule.id,
            weekday=0,
            start_time=time(18, 0),
            end_time=time(19, 0),
        )
    )
    customer = Customer(
        business_id=business.id,
        name="Cancelled Guest",
        phone="+14155550009",
        email="cancelled@example.com",
    )
    db_session.add(customer)
    await db_session.flush()
    starts_at = datetime(2026, 1, 5, 18, 0, tzinfo=timezone(timedelta(hours=-5)))
    db_session.add(
        Reservation(
            business_id=business.id,
            customer_id=customer.id,
            service_type_id=service_type.id,
            time=starts_at,
            ends_at=starts_at + timedelta(minutes=90),
            phone=customer.phone,
            email=customer.email,
            status="cancelled",
            guests=2,
        )
    )
    await db_session.flush()

    response = await availability_service.get_availability(
        db_session,
        business_id=business.id,
        service_type_id=service_type.id,
        start_date=date(2026, 1, 5),
        days=1,
        guests=2,
        now=datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc),
    )

    assert [slot.starts_at.strftime("%H:%M") for slot in response.dates[0].slots] == [
        "18:00",
        "18:30",
    ]


@pytest.mark.asyncio
async def test_service_schedule_completely_overrides_business_default(
    db_session: AsyncSession,
):
    business, service_type, default_schedule = await _create_context(db_session)
    db_session.add(
        BookingScheduleWindow(
            schedule_id=default_schedule.id,
            weekday=0,
            start_time=time(18, 0),
            end_time=time(19, 0),
        )
    )
    service_schedule = BookingSchedule(
        business_id=business.id,
        service_type_id=service_type.id,
        minimum_notice_minutes=0,
        advance_booking_days=30,
        slot_interval_minutes=30,
        default_duration_minutes=60,
        windows=[
            BookingScheduleWindow(
                weekday=0,
                start_time=time(20, 0),
                end_time=time(21, 0),
            )
        ],
    )
    db_session.add(service_schedule)
    await db_session.flush()

    response = await availability_service.get_availability(
        db_session,
        business_id=business.id,
        service_type_id=service_type.id,
        start_date=date(2026, 1, 5),
        days=1,
        guests=2,
        now=datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc),
    )

    assert [slot.starts_at.strftime("%H:%M") for slot in response.dates[0].slots] == [
        "20:00",
        "20:30",
    ]


@pytest.mark.asyncio
async def test_overnight_exception_is_anchored_to_service_date(
    db_session: AsyncSession,
):
    business, service_type, schedule = await _create_context(db_session)
    overnight_exception = BookingScheduleException(
        schedule_id=schedule.id,
        local_date=date(2026, 1, 9),
    )
    db_session.add(overnight_exception)
    await db_session.flush()
    db_session.add_all(
        [
            BookingScheduleExceptionWindow(
                exception_id=overnight_exception.id,
                start_time=time(22, 0),
                end_time=time(2, 0),
                ends_next_day=True,
            ),
            BookingScheduleException(
                schedule_id=schedule.id,
                local_date=date(2026, 1, 10),
                is_closed=True,
            ),
        ]
    )
    await db_session.flush()

    response = await availability_service.get_availability(
        db_session,
        business_id=business.id,
        service_type_id=service_type.id,
        start_date=date(2026, 1, 10),
        days=1,
        guests=2,
        now=datetime(2026, 1, 8, 12, 0, tzinfo=timezone.utc),
    )

    assert [slot.starts_at.strftime("%H:%M") for slot in response.dates[0].slots] == [
        "00:00",
        "00:30",
        "01:00",
        "01:30",
    ]


@pytest.mark.asyncio
async def test_party_size_is_limited_by_business_and_service(
    db_session: AsyncSession,
):
    business, service_type, _ = await _create_context(db_session)

    with pytest.raises(AvailabilityError) as caught:
        await availability_service.get_availability(
            db_session,
            business_id=business.id,
            service_type_id=service_type.id,
            start_date=date(2026, 1, 5),
            days=1,
            guests=7,
            now=datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc),
        )

    assert caught.value.code == "PARTY_SIZE_EXCEEDED"
    assert caught.value.details == {"max_party_size": 6}


@pytest.mark.asyncio
async def test_schedule_row_lock_prevents_concurrent_overbooking(
    db_session: AsyncSession,
):
    business, service_type, schedule = await _create_context(
        db_session,
        timezone_name="UTC",
    )
    schedule.minimum_notice_minutes = 0
    db_session.add_all([
        BookingScheduleWindow(
            schedule_id=schedule.id,
            weekday=weekday,
            start_time=time(0, 0),
            end_time=time(23, 59),
        )
        for weekday in range(7)
    ])
    await db_session.commit()

    starts_at = (
        datetime.now(timezone.utc).replace(
            hour=12, minute=0, second=0, microsecond=0
        )
        + timedelta(days=1)
    )

    async def attempt(index: int) -> str:
        async with TestSessionLocal() as session:
            try:
                await reservation_service.create_public_reservation(
                    session,
                    PublicReservationCreate(
                        business_id=business.id,
                        service_type_id=service_type.id,
                        time=starts_at,
                        phone=f"+1415555010{index}",
                        email=f"guest{index}@example.com",
                        name=f"Guest {index}",
                        guests=2,
                        idempotency_key=f"capacity-{index}",
                    ),
                )
                await session.commit()
                return "created"
            except AvailabilityError as exc:
                await session.rollback()
                return exc.code

    outcomes = await asyncio.gather(attempt(1), attempt(2))

    assert sorted(outcomes) == ["SLOT_UNAVAILABLE", "created"]
    count = await db_session.scalar(
        select(func.count()).select_from(Reservation)
    )
    assert count == 1
