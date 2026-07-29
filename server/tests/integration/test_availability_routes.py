from datetime import datetime, time, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking_schedule import BookingSchedule, BookingScheduleWindow
from app.models.business import Business
from app.models.customer import Customer
from app.models.reservation import Reservation
from app.models.service_type import ServiceType


async def _create_booking_context(
    db: AsyncSession,
    *,
    slug: str = "availability-route",
    enabled_modules: list[str] | None = None,
    open_schedule: bool = True,
) -> tuple[Business, ServiceType]:
    business = Business(
        name="Availability Route Bar",
        slug=slug,
        email=f"{slug}@example.com",
        phone="+14155551000",
        timezone="UTC",
        max_guests=8,
        enabled_modules=(
            ["reservations"] if enabled_modules is None else enabled_modules
        ),
    )
    db.add(business)
    await db.flush()
    service_type = ServiceType(
        business_id=business.id,
        name="Table",
        capacity=6,
        max_concurrent_bookings=1,
        duration=60,
    )
    db.add(service_type)
    await db.flush()
    schedule = BookingSchedule(
        business_id=business.id,
        minimum_notice_minutes=0,
        advance_booking_days=30,
        slot_interval_minutes=30,
        default_duration_minutes=60,
    )
    db.add(schedule)
    await db.flush()
    if open_schedule:
        db.add_all(
            [
                BookingScheduleWindow(
                    schedule_id=schedule.id,
                    weekday=weekday,
                    start_time=time(10, 0),
                    end_time=time(14, 0),
                )
                for weekday in range(7)
            ]
        )
    await db.commit()
    return business, service_type


def _tomorrow() -> datetime:
    return (
        datetime.now(timezone.utc).replace(
            hour=12, minute=0, second=0, microsecond=0
        )
        + timedelta(days=1)
    )


@pytest.mark.asyncio
async def test_public_availability_returns_grouped_absolute_slots(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, service_type = await _create_booking_context(db_session)
    requested_day = _tomorrow().date()

    response = await client.get(
        f"/api/availability/business/{business.id}",
        params={
            "service_type_id": str(service_type.id),
            "start_date": requested_day.isoformat(),
            "days": 1,
            "guests": 4,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["timezone"] == "UTC"
    assert body["duration_minutes"] == 60
    assert body["max_party_size"] == 6
    assert body["dates"][0]["date"] == requested_day.isoformat()
    assert body["dates"][0]["slots"][0] == {
        "starts_at": f"{requested_day.isoformat()}T10:00:00Z",
        "ends_at": f"{requested_day.isoformat()}T11:00:00Z",
    }
    assert "occupancy" not in body["dates"][0]["slots"][0]


@pytest.mark.asyncio
async def test_public_availability_hides_cross_tenant_service(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, _ = await _create_booking_context(db_session, slug="tenant-a")
    _, other_service = await _create_booking_context(db_session, slug="tenant-b")

    response = await client.get(
        f"/api/availability/business/{business.id}",
        params={
            "service_type_id": str(other_service.id),
            "start_date": _tomorrow().date().isoformat(),
            "days": 1,
            "guests": 1,
        },
    )

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_public_availability_requires_reservations_module(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, service_type = await _create_booking_context(
        db_session,
        enabled_modules=["ordering"],
    )

    response = await client.get(
        f"/api/availability/business/{business.id}",
        params={
            "service_type_id": str(service_type.id),
            "start_date": _tomorrow().date().isoformat(),
            "days": 1,
            "guests": 1,
        },
    )

    assert response.status_code == 403
    assert response.json() == {
        "code": "MODULE_DISABLED",
        "message": "The reservations module is not enabled for this business",
        "details": {"module": "reservations"},
    }


@pytest.mark.asyncio
async def test_public_availability_is_blocked_when_online_bookings_are_disabled(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, service_type = await _create_booking_context(db_session)
    business.public_reservations_enabled = False
    await db_session.commit()

    response = await client.get(
        f"/api/availability/business/{business.id}",
        params={
            "service_type_id": str(service_type.id),
            "start_date": _tomorrow().date().isoformat(),
            "days": 1,
            "guests": 1,
        },
    )

    assert response.status_code == 403
    assert response.json()["code"] == "PUBLIC_RESERVATIONS_DISABLED"


@pytest.mark.asyncio
async def test_closed_schedule_returns_an_empty_day(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, service_type = await _create_booking_context(
        db_session,
        open_schedule=False,
    )

    response = await client.get(
        f"/api/availability/business/{business.id}",
        params={
            "service_type_id": str(service_type.id),
            "start_date": _tomorrow().date().isoformat(),
            "days": 1,
            "guests": 1,
        },
    )

    assert response.status_code == 200
    assert response.json()["dates"][0]["slots"] == []


@pytest.mark.asyncio
async def test_party_size_error_exposes_server_limit(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, service_type = await _create_booking_context(db_session)

    response = await client.get(
        f"/api/availability/business/{business.id}",
        params={
            "service_type_id": str(service_type.id),
            "start_date": _tomorrow().date().isoformat(),
            "days": 1,
            "guests": 7,
        },
    )

    assert response.status_code == 422
    assert response.json()["code"] == "PARTY_SIZE_EXCEEDED"
    assert response.json()["details"] == {"max_party_size": 6}


@pytest.mark.asyncio
async def test_stale_public_slot_returns_nearest_alternatives(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, service_type = await _create_booking_context(db_session)
    selected_time = _tomorrow()
    customer = Customer(
        business_id=business.id,
        name="Existing Guest",
        phone="+14155551001",
        email="existing@example.com",
    )
    db_session.add(customer)
    await db_session.flush()
    db_session.add(
        Reservation(
            business_id=business.id,
            customer_id=customer.id,
            service_type_id=service_type.id,
            time=selected_time,
            ends_at=selected_time + timedelta(minutes=60),
            phone=customer.phone,
            email=customer.email,
            status="confirmed",
            guests=2,
        )
    )
    await db_session.commit()

    response = await client.post(
        "/api/reservations/public",
        json={
            "business_id": str(business.id),
            "service_type_id": str(service_type.id),
            "time": selected_time.isoformat(),
            "phone": "+14155551002",
            "email": "new@example.com",
            "name": "New Guest",
            "guests": 2,
        },
    )

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "SLOT_UNAVAILABLE"
    assert 1 <= len(body["details"]["alternatives"]) <= 5
    assert all(
        set(alternative) == {"starts_at", "ends_at"}
        for alternative in body["details"]["alternatives"]
    )
