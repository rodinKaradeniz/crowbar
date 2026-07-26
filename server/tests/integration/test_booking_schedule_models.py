from datetime import date, datetime, time, timedelta, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
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


async def _business(db: AsyncSession, *, slug: str) -> Business:
    business = Business(
        name=slug.title(),
        slug=slug,
        email=f"{slug}@example.com",
        phone="+14155550100",
    )
    db.add(business)
    await db.flush()
    return business


@pytest.mark.asyncio
async def test_schedule_persists_split_windows_and_date_exceptions(
    db_session: AsyncSession,
):
    business = await _business(db_session, slug="schedule-biz")
    schedule = BookingSchedule(
        business_id=business.id,
        minimum_notice_minutes=90,
        advance_booking_days=45,
        slot_interval_minutes=30,
        default_duration_minutes=75,
        windows=[
            BookingScheduleWindow(
                weekday=4,
                start_time=time(12, 0),
                end_time=time(15, 0),
            ),
            BookingScheduleWindow(
                weekday=4,
                start_time=time(18, 0),
                end_time=time(2, 0),
                ends_next_day=True,
            ),
        ],
        exceptions=[
            BookingScheduleException(
                local_date=date(2026, 12, 25),
                is_closed=True,
            ),
            BookingScheduleException(
                local_date=date(2026, 12, 31),
                windows=[
                    BookingScheduleExceptionWindow(
                        start_time=time(20, 0),
                        end_time=time(3, 0),
                        ends_next_day=True,
                    )
                ],
            ),
        ],
    )
    db_session.add(schedule)
    await db_session.flush()
    await db_session.refresh(schedule, ["windows", "exceptions"])

    assert [window.start_time for window in schedule.windows] == [
        time(12, 0),
        time(18, 0),
    ]
    assert [exception.local_date for exception in schedule.exceptions] == [
        date(2026, 12, 25),
        date(2026, 12, 31),
    ]


@pytest.mark.asyncio
async def test_only_one_default_schedule_is_allowed_per_business(
    db_session: AsyncSession,
):
    business = await _business(db_session, slug="one-default")
    db_session.add_all(
        [
            BookingSchedule(business_id=business.id),
            BookingSchedule(business_id=business.id),
        ]
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_service_override_must_match_the_business(
    db_session: AsyncSession,
):
    first = await _business(db_session, slug="first-business")
    second = await _business(db_session, slug="second-business")
    service = ServiceType(business_id=first.id, name="Table")
    db_session.add(service)
    await db_session.flush()

    db_session.add(
        BookingSchedule(
            business_id=second.id,
            service_type_id=service.id,
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_schedule_delete_cascades_to_owned_rows(db_session: AsyncSession):
    business = await _business(db_session, slug="cascade-biz")
    schedule = BookingSchedule(
        business_id=business.id,
        windows=[
            BookingScheduleWindow(
                weekday=0, start_time=time(18, 0), end_time=time(22, 0)
            )
        ],
        exceptions=[
            BookingScheduleException(
                local_date=date(2026, 8, 1), is_closed=True
            )
        ],
    )
    db_session.add(schedule)
    await db_session.flush()

    await db_session.delete(schedule)
    await db_session.flush()

    window_count = await db_session.scalar(
        select(func.count()).select_from(BookingScheduleWindow)
    )
    exception_count = await db_session.scalar(
        select(func.count()).select_from(BookingScheduleException)
    )
    assert window_count == 0
    assert exception_count == 0


@pytest.mark.asyncio
async def test_reservation_interval_and_override_audit_are_persisted(
    db_session: AsyncSession,
):
    business = await _business(db_session, slug="reservation-interval")
    service = ServiceType(
        business_id=business.id,
        name="Table",
        duration=90,
    )
    customer = Customer(
        business_id=business.id,
        name="Guest",
        phone="+14155550101",
        email="guest@example.com",
    )
    db_session.add_all([service, customer])
    await db_session.flush()

    starts_at = datetime(2026, 8, 1, 18, 0, tzinfo=timezone.utc)
    reservation = Reservation(
        business_id=business.id,
        customer_id=customer.id,
        service_type_id=service.id,
        time=starts_at,
        ends_at=starts_at + timedelta(minutes=90),
        phone=customer.phone,
        email=customer.email,
        status="confirmed",
        availability_override_reason="Manager approved a private event",
        availability_overridden_at=datetime.now(timezone.utc),
    )
    db_session.add(reservation)
    await db_session.flush()

    assert reservation.ends_at - reservation.time == timedelta(minutes=90)
    assert reservation.availability_override_reason is not None
