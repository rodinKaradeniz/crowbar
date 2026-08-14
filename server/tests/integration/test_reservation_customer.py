"""
Phase A integration tests — reservation creation populates the customers table.

Replaces the earlier dual-write/backfill suite (the cutover landed in
migration 015, so the parallel column and the backfill script no longer exist).

Verifies the post-cutover invariants:
  - Public reservation creation upserts a Customer and links the reservation.
  - Authenticated reservation creation does the same (no name supplied).
  - Two reservations with the same phone share one Customer row per business.
  - The Customer row picks up name/email if the public-form path supplies them.
"""

import asyncio
from datetime import datetime, time, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.business import Business
from app.models.booking_schedule import BookingSchedule, BookingScheduleWindow
from app.models.customer import Customer
from app.models.service_type import ServiceType
from app.schemas.reservation import PublicReservationCreate, ReservationCreate
from app.services import reservation_service


@pytest_asyncio.fixture
async def biz(db_session: AsyncSession) -> Business:
    b = Business(
        name="Test Biz",
        slug="test-biz",
        email="biz@example.com",
        phone="5550000000",
    )
    db_session.add(b)
    await db_session.flush()
    db_session.add(
        BookingSchedule(
            business_id=b.id,
            windows=[
                BookingScheduleWindow(
                    weekday=weekday,
                    start_time=time(0, 0),
                    end_time=time(23, 59),
                )
                for weekday in range(7)
            ],
        )
    )
    await db_session.flush()
    return b


def _future_time(days: int) -> datetime:
    return (
        datetime.now(timezone.utc).replace(
            hour=12, minute=0, second=0, microsecond=0
        )
        + timedelta(days=days)
    )


@pytest_asyncio.fixture
async def service_type(db_session: AsyncSession, biz: Business) -> ServiceType:
    st = ServiceType(business_id=biz.id, name="Table", capacity=4)
    db_session.add(st)
    await db_session.flush()
    return st


@pytest.mark.asyncio
async def test_create_public_reservation_creates_customer(
    db_session: AsyncSession, biz: Business, service_type: ServiceType
):
    data = PublicReservationCreate(
        business_id=biz.id,
        service_type_id=service_type.id,
        time=_future_time(1),
        phone="+14155557777",
        email="frank@example.com",
        name="Frank",
        guests=2,
        idempotency_key="frank-1",
    )

    r = await reservation_service.create_public_reservation(db_session, data)

    assert r.customer_id is not None
    assert r.channel == "web"
    assert r.ends_at == r.time + timedelta(minutes=60)

    customer = (
        await db_session.execute(select(Customer).where(Customer.id == r.customer_id))
    ).scalar_one()
    assert customer.phone == "+14155557777"
    assert customer.email == "frank@example.com"
    assert customer.name == "Frank"
    assert customer.business_id == biz.id


@pytest.mark.asyncio
async def test_create_authenticated_reservation_creates_customer(
    db_session: AsyncSession, biz: Business, service_type: ServiceType
):
    data = ReservationCreate(
        service_type_id=service_type.id,
        time=_future_time(2),
        name="Grace",
        phone="+14155556666",
        email="grace@example.com",
        guests=1,
    )

    r = await reservation_service.create_reservation(
        db_session, business_id=biz.id, data=data
    )

    assert r.customer_id is not None
    assert r.channel == "staff"

    customer = (
        await db_session.execute(select(Customer).where(Customer.id == r.customer_id))
    ).scalar_one()
    assert customer.phone == "+14155556666"
    assert customer.email == "grace@example.com"
    assert customer.name == "Grace"


@pytest.mark.asyncio
async def test_two_reservations_same_phone_share_customer(
    db_session: AsyncSession, biz: Business, service_type: ServiceType
):
    common = dict(
        business_id=biz.id,
        service_type_id=service_type.id,
        phone="+14155555555",
        email="hank@example.com",
        name="Hank",
        guests=2,
    )
    r1 = await reservation_service.create_public_reservation(
        db_session,
        PublicReservationCreate(time=_future_time(3), idempotency_key="hank-1", **common),
    )
    r2 = await reservation_service.create_public_reservation(
        db_session,
        PublicReservationCreate(time=_future_time(4), idempotency_key="hank-2", **common),
    )

    assert r1.customer_id == r2.customer_id
    customers = (await db_session.execute(select(Customer).where(Customer.business_id == biz.id))).scalars().all()
    assert len(customers) == 1


@pytest.mark.asyncio
async def test_subsequent_public_reservation_fills_in_name_and_email(
    db_session: AsyncSession, biz: Business, service_type: ServiceType
):
    """Staff and public bookings converge on one phone-keyed customer."""
    auth_data = ReservationCreate(
        service_type_id=service_type.id,
        time=_future_time(5),
        name="Iris Staff Entry",
        phone="+14155553333",
        email=None or "iris-tmp@example.com",  # email is required on the schema
        guests=1,
    )
    r1 = await reservation_service.create_reservation(
        db_session, business_id=biz.id, data=auth_data
    )

    public_data = PublicReservationCreate(
        business_id=biz.id,
        service_type_id=service_type.id,
        time=_future_time(6),
        phone="+14155553333",
        email="iris@example.com",
        name="Iris",
        guests=2,
        idempotency_key="iris-public",
    )
    r2 = await reservation_service.create_public_reservation(db_session, public_data)

    assert r1.customer_id == r2.customer_id
    customer = (
        await db_session.execute(select(Customer).where(Customer.id == r2.customer_id))
    ).scalar_one()
    assert customer.name == "Iris"
    assert customer.email == "iris@example.com"


@pytest.mark.asyncio
async def test_public_reservation_idempotency_replays_and_rejects_changed_request(
    db_session: AsyncSession, biz: Business, service_type: ServiceType
):
    original = PublicReservationCreate(
        business_id=biz.id,
        service_type_id=service_type.id,
        time=_future_time(7),
        phone="+4915111111111",
        email="retry@example.com",
        name="Retry Guest",
        guests=2,
        idempotency_key="stable-public-key",
    )
    created = await reservation_service.create_public_reservation(db_session, original)
    replay = await reservation_service.create_public_reservation(db_session, original)

    assert replay.id == created.id
    assert replay._idempotent_created is False

    changed = original.model_copy(update={"guests": 3})
    with pytest.raises(
        reservation_service.ReservationIdempotencyConflict,
        match="different reservation",
    ):
        await reservation_service.create_public_reservation(db_session, changed)


@pytest.mark.asyncio
async def test_concurrent_public_reservation_retry_creates_one_row(
    db_session: AsyncSession, biz: Business, service_type: ServiceType
):
    data = PublicReservationCreate(
        business_id=biz.id,
        service_type_id=service_type.id,
        time=_future_time(8),
        phone="+4915222222222",
        email="concurrent@example.com",
        name="Concurrent Guest",
        guests=2,
        idempotency_key="concurrent-public-key",
    )
    await db_session.commit()
    session_factory = async_sessionmaker(
        db_session.bind, class_=AsyncSession, expire_on_commit=False
    )

    async def submit() -> tuple[str, bool]:
        async with session_factory() as session:
            reservation = await reservation_service.create_public_reservation(
                session, data
            )
            result = (str(reservation.id), reservation._idempotent_created)
            await session.commit()
            return result

    results = await asyncio.gather(submit(), submit())

    assert results[0][0] == results[1][0]
    assert sorted(created for _, created in results) == [False, True]
