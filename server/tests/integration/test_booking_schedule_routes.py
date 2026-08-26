from datetime import date, time

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking_schedule import (
    BookingSchedule,
    BookingScheduleException,
    BookingScheduleWindow,
)
from app.models.business import Business
from app.models.service_type import ServiceType
from app.models.staff import Staff
from app.models.user import User
from app.services.auth_service import create_access_token


async def _create_staff_tenant(
    db: AsyncSession,
    *,
    slug: str,
    role: str = "owner",
    enabled_modules: list[str] | None = None,
    operating_hours: dict | None = None,
) -> tuple[Business, User, str]:
    business = Business(
        name=slug.title(),
        slug=slug,
        email=f"{slug}@example.com",
        phone="+14155552000",
        timezone="UTC",
        enabled_modules=(
            ["reservations"] if enabled_modules is None else enabled_modules
        ),
        operating_hours=operating_hours or {},
    )
    user = User(
        email=f"{role}-{slug}@example.com",
        name=f"{role.title()} User",
        password_hash="unused-in-token-tests",
        user_type="staff",
    )
    db.add_all([business, user])
    await db.flush()
    db.add_all(
        [
            Staff(user_id=user.id, business_id=business.id, role=role),
            BookingSchedule(
                business_id=business.id,
                minimum_notice_minutes=30,
                advance_booking_days=30,
                slot_interval_minutes=15,
                default_duration_minutes=60,
            ),
        ]
    )
    await db.commit()
    return business, user, create_access_token(str(user.id), "staff")


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _replacement() -> dict:
    return {
        "minimum_notice_minutes": 90,
        "advance_booking_days": 45,
        "slot_interval_minutes": 30,
        "default_duration_minutes": 75,
        "windows": [
            {
                "weekday": 0,
                "start_time": "12:00",
                "end_time": "15:00",
                "ends_next_day": False,
            },
            {
                "weekday": 0,
                "start_time": "18:00",
                "end_time": "02:00",
                "ends_next_day": True,
            },
        ],
        "exceptions": [
            {
                "local_date": "2026-12-25",
                "is_closed": True,
                "windows": [],
            },
            {
                "local_date": "2026-12-31",
                "is_closed": False,
                "windows": [
                    {
                        "start_time": "20:00",
                        "end_time": "03:00",
                        "ends_next_day": True,
                    }
                ],
            },
        ],
    }


@pytest.mark.asyncio
async def test_all_staff_can_read_but_only_manager_or_owner_can_replace(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, _, staff_token = await _create_staff_tenant(
        db_session,
        slug="read-only-staff",
        role="host_server",
    )

    read_response = await client.get(
        "/api/booking-schedules",
        headers=_headers(staff_token),
    )
    assert read_response.status_code == 200
    assert read_response.json()["default_schedule"]["business_id"] == str(
        business.id
    )

    write_response = await client.put(
        "/api/booking-schedules/default",
        headers=_headers(staff_token),
        json=_replacement(),
    )
    assert write_response.status_code == 403
    assert write_response.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_manager_can_replace_complete_default_schedule(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, _, manager_token = await _create_staff_tenant(
        db_session,
        slug="manager-schedule",
        role="manager",
    )

    response = await client.put(
        "/api/booking-schedules/default",
        headers=_headers(manager_token),
        json=_replacement(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["minimum_notice_minutes"] == 90
    assert body["slot_interval_minutes"] == 30
    assert len(body["windows"]) == 2
    assert body["windows"][1]["ends_next_day"] is True
    assert [item["local_date"] for item in body["exceptions"]] == [
        "2026-12-25",
        "2026-12-31",
    ]


@pytest.mark.asyncio
async def test_service_override_can_be_created_and_reverted(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, _, owner_token = await _create_staff_tenant(
        db_session,
        slug="service-override",
    )
    service = ServiceType(
        business_id=business.id,
        name="Dining Room",
        capacity=8,
    )
    db_session.add(service)
    await db_session.commit()

    create_response = await client.put(
        f"/api/booking-schedules/service-types/{service.id}",
        headers=_headers(owner_token),
        json=_replacement(),
    )
    assert create_response.status_code == 200
    assert create_response.json()["service_type_id"] == str(service.id)

    list_response = await client.get(
        "/api/booking-schedules",
        headers=_headers(owner_token),
    )
    assert len(list_response.json()["service_overrides"]) == 1

    delete_response = await client.delete(
        f"/api/booking-schedules/service-types/{service.id}",
        headers=_headers(owner_token),
    )
    assert delete_response.status_code == 204
    override_count = await db_session.scalar(
        select(func.count())
        .select_from(BookingSchedule)
        .where(BookingSchedule.service_type_id == service.id)
    )
    assert override_count == 0


@pytest.mark.asyncio
async def test_service_override_cannot_cross_tenants(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, _, first_token = await _create_staff_tenant(
        db_session,
        slug="schedule-tenant-a",
    )
    second_business, _, _ = await _create_staff_tenant(
        db_session,
        slug="schedule-tenant-b",
    )
    other_service = ServiceType(
        business_id=second_business.id,
        name="Other Tenant Table",
        capacity=4,
    )
    db_session.add(other_service)
    await db_session.commit()
    other_service_id = other_service.id

    response = await client.put(
        f"/api/booking-schedules/service-types/{other_service_id}",
        headers=_headers(first_token),
        json=_replacement(),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert await db_session.scalar(
        select(func.count())
        .select_from(BookingSchedule)
        .where(BookingSchedule.service_type_id == other_service_id)
    ) == 0


@pytest.mark.asyncio
async def test_operating_hours_copy_has_preview_and_preserves_other_policy(
    client: AsyncClient,
    db_session: AsyncSession,
):
    business, _, owner_token = await _create_staff_tenant(
        db_session,
        slug="copy-hours",
        operating_hours={
            "monday": {"open": "18:00", "close": "02:00"},
            "tuesday": {"closed": True},
        },
    )
    schedule = await db_session.scalar(
        select(BookingSchedule).where(BookingSchedule.business_id == business.id)
    )
    assert schedule is not None
    db_session.add_all(
        [
            BookingScheduleWindow(
                schedule_id=schedule.id,
                weekday=2,
                start_time=time(12, 0),
                end_time=time(14, 0),
            ),
            BookingScheduleException(
                schedule_id=schedule.id,
                local_date=date(2026, 12, 25),
                is_closed=True,
            ),
        ]
    )
    await db_session.commit()
    db_session.expire_all()

    preview = await client.get(
        "/api/booking-schedules/default/operating-hours-preview",
        headers=_headers(owner_token),
    )
    assert preview.status_code == 200
    assert preview.json()["current_windows"][0]["weekday"] == 2
    assert preview.json()["proposed_windows"] == [
        {
            "weekday": 0,
            "start_time": "18:00:00",
            "end_time": "02:00:00",
            "ends_next_day": True,
        }
    ]

    copied = await client.post(
        "/api/booking-schedules/default/copy-operating-hours",
        headers=_headers(owner_token),
    )
    assert copied.status_code == 200
    body = copied.json()
    assert body["minimum_notice_minutes"] == 30
    assert body["windows"][0]["weekday"] == 0
    assert body["exceptions"][0]["local_date"] == "2026-12-25"


@pytest.mark.asyncio
async def test_booking_schedule_routes_require_reservations_module(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, _, owner_token = await _create_staff_tenant(
        db_session,
        slug="no-reservation-module",
        enabled_modules=["ordering"],
    )

    response = await client.get(
        "/api/booking-schedules",
        headers=_headers(owner_token),
    )

    assert response.status_code == 403
    assert response.json()["code"] == "MODULE_DISABLED"

    service_response = await client.post(
        "/api/service-types",
        headers=_headers(owner_token),
        json={
            "business_id": str(
                await db_session.scalar(
                    select(Business.id).where(Business.slug == "no-reservation-module")
                )
            ),
            "name": "Disabled Module Service",
            "capacity": 2,
        },
    )
    assert service_response.status_code == 403
    assert service_response.json()["code"] == "MODULE_DISABLED"


@pytest.mark.asyncio
async def test_service_type_mutations_are_role_and_tenant_scoped(
    client: AsyncClient,
    db_session: AsyncSession,
):
    first_business, _, staff_token = await _create_staff_tenant(
        db_session,
        slug="service-staff",
        role="host_server",
    )
    second_business, _, owner_token = await _create_staff_tenant(
        db_session,
        slug="service-owner",
    )
    first_service = ServiceType(
        business_id=first_business.id,
        name="First Service",
        capacity=2,
    )
    db_session.add(first_service)
    await db_session.commit()
    first_service_id = first_service.id
    first_business_id = first_business.id
    second_business_id = second_business.id

    staff_response = await client.patch(
        f"/api/service-types/{first_service_id}",
        headers=_headers(staff_token),
        json={"max_concurrent_bookings": 3},
    )
    assert staff_response.status_code == 403

    cross_tenant_response = await client.patch(
        f"/api/service-types/{first_service_id}",
        headers=_headers(owner_token),
        json={"max_concurrent_bookings": 3},
    )
    assert cross_tenant_response.status_code == 404

    mismatched_create = await client.post(
        "/api/service-types",
        headers=_headers(owner_token),
        json={
            "business_id": str(first_business_id),
            "name": "Injected Service",
            "capacity": 2,
        },
    )
    assert mismatched_create.status_code == 403
    assert second_business_id != first_business_id

    staff_business_update = await client.patch(
        f"/api/businesses/{first_business_id}",
        headers=_headers(staff_token),
        json={"max_guests": 12},
    )
    assert staff_business_update.status_code == 403

    owner_business_update = await client.patch(
        f"/api/businesses/{second_business_id}",
        headers=_headers(owner_token),
        json={"max_guests": 12},
    )
    assert owner_business_update.status_code == 200
    assert owner_business_update.json()["max_guests"] == 12
