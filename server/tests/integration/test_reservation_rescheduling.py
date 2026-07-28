from datetime import datetime, time, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking_schedule import BookingSchedule, BookingScheduleWindow
from app.models.business import Business
from app.models.customer import Customer
from app.models.reservation import Reservation
from app.models.service_type import ServiceType
from app.models.staff import Staff
from app.models.user import User
from app.services.auth_service import create_access_token


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _tomorrow(hour: int = 12) -> datetime:
    return (
        datetime.now(timezone.utc).replace(
            hour=hour,
            minute=0,
            second=0,
            microsecond=0,
        )
        + timedelta(days=1)
    )


async def _create_context(
    db: AsyncSession,
    *,
    slug: str,
    enabled_modules: list[str] | None = None,
    status: str = "confirmed",
    starts_at: datetime | None = None,
) -> tuple[Business, ServiceType, Reservation, str]:
    business = Business(
        name=f"{slug} Bar",
        slug=slug,
        email=f"{slug}@example.com",
        phone="+14155551000",
        timezone="UTC",
        max_guests=8,
        enabled_modules=(
            ["reservations"] if enabled_modules is None else enabled_modules
        ),
    )
    user = User(
        email=f"staff-{slug}@example.com",
        name="Staff Member",
        password_hash="unused",
        user_type="staff",
    )
    db.add_all([business, user])
    await db.flush()
    db.add(Staff(user_id=user.id, business_id=business.id, role="staff"))

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
    db.add_all(
        [
            BookingScheduleWindow(
                schedule_id=schedule.id,
                weekday=weekday,
                start_time=time(10, 0),
                end_time=time(18, 0),
            )
            for weekday in range(7)
        ]
    )
    customer = Customer(
        business_id=business.id,
        name="Guest",
        phone="+14155551001",
        email=f"guest-{slug}@example.com",
    )
    db.add(customer)
    await db.flush()
    start = starts_at or _tomorrow()
    reservation = Reservation(
        business_id=business.id,
        customer_id=customer.id,
        service_type_id=service_type.id,
        time=start,
        ends_at=start + timedelta(hours=1),
        phone=customer.phone,
        email=customer.email,
        status=status,
        guests=2,
        sms_reminder_sent=True,
    )
    db.add(reservation)
    await db.commit()
    return (
        business,
        service_type,
        reservation,
        create_access_token(str(user.id), "staff"),
    )


@pytest.mark.asyncio
async def test_reschedule_availability_excludes_the_reservation_being_moved(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, service_type, reservation, token = await _create_context(
        db_session,
        slug="exclude-current",
    )

    response = await client.get(
        f"/api/reservations/{reservation.id}/availability",
        headers=_headers(token),
        params={
            "service_type_id": str(service_type.id),
            "start_date": reservation.time.date().isoformat(),
            "days": 1,
            "guests": 2,
        },
    )

    assert response.status_code == 200
    starts = {
        slot["starts_at"]
        for slot in response.json()["dates"][0]["slots"]
    }
    assert reservation.time.isoformat().replace("+00:00", "Z") in starts


@pytest.mark.asyncio
async def test_reschedule_atomically_updates_the_occupied_interval(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, _, reservation, token = await _create_context(
        db_session,
        slug="successful-move",
    )
    target_service = ServiceType(
        business_id=business.id,
        name="Private Room",
        capacity=6,
        max_concurrent_bookings=1,
        duration=90,
    )
    db_session.add(target_service)
    await db_session.commit()
    new_start = _tomorrow(14)

    response = await client.post(
        f"/api/reservations/{reservation.id}/reschedule",
        headers=_headers(token),
        json={
            "service_type_id": str(target_service.id),
            "time": new_start.isoformat(),
            "guests": 4,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["time"] == new_start.isoformat().replace("+00:00", "Z")
    assert body["ends_at"] == (
        new_start + timedelta(minutes=90)
    ).isoformat().replace("+00:00", "Z")
    assert body["service_type_id"] == str(target_service.id)
    assert body["guests"] == 4
    await db_session.refresh(reservation)
    assert reservation.time == new_start
    assert reservation.ends_at == new_start + timedelta(minutes=90)
    assert reservation.sms_reminder_sent is False


@pytest.mark.asyncio
async def test_failed_reschedule_preserves_the_old_interval(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, service_type, reservation, token = await _create_context(
        db_session,
        slug="occupied-target",
    )
    target = _tomorrow(14)
    other_customer = Customer(
        business_id=business.id,
        name="Other Guest",
        phone="+14155551002",
        email="other@example.com",
    )
    db_session.add(other_customer)
    await db_session.flush()
    db_session.add(
        Reservation(
            business_id=business.id,
            customer_id=other_customer.id,
            service_type_id=service_type.id,
            time=target,
            ends_at=target + timedelta(hours=1),
            phone=other_customer.phone,
            email=other_customer.email,
            status="confirmed",
            guests=2,
        )
    )
    old_time = reservation.time
    old_end = reservation.ends_at
    await db_session.commit()

    response = await client.post(
        f"/api/reservations/{reservation.id}/reschedule",
        headers=_headers(token),
        json={
            "service_type_id": str(service_type.id),
            "time": target.isoformat(),
            "guests": 2,
        },
    )

    assert response.status_code == 409
    assert response.json()["code"] == "SLOT_UNAVAILABLE"
    await db_session.refresh(reservation)
    assert reservation.time == old_time
    assert reservation.ends_at == old_end


@pytest.mark.asyncio
async def test_reschedule_is_tenant_scoped(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, _, _, first_token = await _create_context(db_session, slug="move-tenant-a")
    _, second_service, second_reservation, _ = await _create_context(
        db_session,
        slug="move-tenant-b",
    )

    response = await client.post(
        f"/api/reservations/{second_reservation.id}/reschedule",
        headers=_headers(first_token),
        json={
            "service_type_id": str(second_service.id),
            "time": _tomorrow(15).isoformat(),
            "guests": 2,
        },
    )

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["cancelled", "completed"])
async def test_terminal_reservations_cannot_be_rescheduled(
    client: AsyncClient,
    db_session: AsyncSession,
    status: str,
):
    _, service_type, reservation, token = await _create_context(
        db_session,
        slug=f"terminal-{status}",
        status=status,
    )

    response = await client.post(
        f"/api/reservations/{reservation.id}/reschedule",
        headers=_headers(token),
        json={
            "service_type_id": str(service_type.id),
            "time": _tomorrow(15).isoformat(),
            "guests": 2,
        },
    )

    assert response.status_code == 409
    assert response.json()["code"] == "RESERVATION_NOT_RESCHEDULABLE"


@pytest.mark.asyncio
async def test_past_reservations_cannot_be_rescheduled(
    client: AsyncClient,
    db_session: AsyncSession,
):
    past = datetime.now(timezone.utc) - timedelta(days=1)
    _, service_type, reservation, token = await _create_context(
        db_session,
        slug="past-reservation",
        starts_at=past,
    )

    response = await client.post(
        f"/api/reservations/{reservation.id}/reschedule",
        headers=_headers(token),
        json={
            "service_type_id": str(service_type.id),
            "time": _tomorrow(15).isoformat(),
            "guests": 2,
        },
    )

    assert response.status_code == 409
    assert response.json()["code"] == "RESERVATION_NOT_RESCHEDULABLE"


@pytest.mark.asyncio
async def test_rescheduling_requires_the_reservations_module(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, service_type, reservation, token = await _create_context(
        db_session,
        slug="move-module-disabled",
        enabled_modules=["ordering"],
    )

    response = await client.post(
        f"/api/reservations/{reservation.id}/reschedule",
        headers=_headers(token),
        json={
            "service_type_id": str(service_type.id),
            "time": _tomorrow(15).isoformat(),
            "guests": 2,
        },
    )

    assert response.status_code == 403
    assert response.json()["code"] == "MODULE_DISABLED"


@pytest.mark.asyncio
async def test_generic_patch_rejects_allocation_fields(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, _, reservation, token = await _create_context(
        db_session,
        slug="legacy-patch",
    )
    original_time = reservation.time

    response = await client.patch(
        f"/api/reservations/{reservation.id}",
        headers=_headers(token),
        json={"time": _tomorrow(16).isoformat()},
    )

    assert response.status_code == 422
    await db_session.refresh(reservation)
    assert reservation.time == original_time


@pytest.mark.asyncio
async def test_generic_patch_cannot_reactivate_a_terminal_reservation(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, _, reservation, token = await _create_context(
        db_session,
        slug="no-reactivation-bypass",
        status="cancelled",
    )

    response = await client.patch(
        f"/api/reservations/{reservation.id}",
        headers=_headers(token),
        json={"status": "confirmed"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "RESERVATION_NOT_RESCHEDULABLE"
