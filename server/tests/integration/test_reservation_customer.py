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

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
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
    return b


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
        time=datetime(2026, 7, 1, 20, 0, tzinfo=timezone.utc),
        phone="+14155557777",
        email="frank@example.com",
        name="Frank",
        guests=2,
    )

    r = await reservation_service.create_public_reservation(db_session, data)

    assert r.customer_id is not None
    assert r.channel == "web"

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
        business_id=biz.id,
        service_type_id=service_type.id,
        time=datetime(2026, 7, 2, 20, 0, tzinfo=timezone.utc),
        phone="+14155556666",
        email="grace@example.com",
        guests=1,
    )

    r = await reservation_service.create_reservation(db_session, data)

    assert r.customer_id is not None
    assert r.channel == "web"

    customer = (
        await db_session.execute(select(Customer).where(Customer.id == r.customer_id))
    ).scalar_one()
    assert customer.phone == "+14155556666"
    assert customer.email == "grace@example.com"
    # Auth path doesn't carry a name.
    assert customer.name is None


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
        PublicReservationCreate(time=datetime(2026, 7, 3, 20, 0, tzinfo=timezone.utc), **common),
    )
    r2 = await reservation_service.create_public_reservation(
        db_session,
        PublicReservationCreate(time=datetime(2026, 7, 4, 20, 0, tzinfo=timezone.utc), **common),
    )

    assert r1.customer_id == r2.customer_id
    customers = (await db_session.execute(select(Customer).where(Customer.business_id == biz.id))).scalars().all()
    assert len(customers) == 1


@pytest.mark.asyncio
async def test_subsequent_public_reservation_fills_in_name_and_email(
    db_session: AsyncSession, biz: Business, service_type: ServiceType
):
    """Authenticated path creates a nameless customer; later public booking
    by the same phone should fill in the name + email."""
    auth_data = ReservationCreate(
        business_id=biz.id,
        service_type_id=service_type.id,
        time=datetime(2026, 7, 5, 20, 0, tzinfo=timezone.utc),
        phone="+14155553333",
        email=None or "iris-tmp@example.com",  # email is required on the schema
        guests=1,
    )
    r1 = await reservation_service.create_reservation(db_session, auth_data)

    public_data = PublicReservationCreate(
        business_id=biz.id,
        service_type_id=service_type.id,
        time=datetime(2026, 7, 6, 20, 0, tzinfo=timezone.utc),
        phone="+14155553333",
        email="iris@example.com",
        name="Iris",
        guests=2,
    )
    r2 = await reservation_service.create_public_reservation(db_session, public_data)

    assert r1.customer_id == r2.customer_id
    customer = (
        await db_session.execute(select(Customer).where(Customer.id == r2.customer_id))
    ).scalar_one()
    assert customer.name == "Iris"
    assert customer.email == "iris@example.com"
