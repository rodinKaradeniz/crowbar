"""Integration tests for reservation routes – full CRUD lifecycle."""

from datetime import datetime, time, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking_schedule import BookingSchedule, BookingScheduleWindow
from app.models.business import Business


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


async def _create_business_owner(client: AsyncClient) -> tuple[str, str]:
    """Register a business owner, return (token, business_id)."""
    reg = await client.post(
        "/api/auth/register-business",
        json={
            "email": "owner@testbiz.com",
            "password": "pass123",
            "name": "Owner",
            "phone": "+31612345678",
            "business_name": "Test Bar",
            "business_slug": "test-bar",
        },
    )
    token = reg.json()["access_token"]

    me = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    business_id = me.json()["business_id"]
    return token, business_id


async def _open_default_schedule(
    db: AsyncSession,
    business_id: str,
) -> None:
    schedule = await db.scalar(
        select(BookingSchedule).where(
            BookingSchedule.business_id == business_id,
            BookingSchedule.service_type_id.is_(None),
        )
    )
    assert schedule is not None
    schedule.windows = [
        BookingScheduleWindow(
            weekday=weekday,
            start_time=time(0, 0),
            end_time=time(23, 59),
        )
        for weekday in range(7)
    ]
    await db.commit()


def _future_time(days: int) -> str:
    value = (
        datetime.now(timezone.utc).replace(
            hour=12, minute=0, second=0, microsecond=0
        )
        + timedelta(days=days)
    )
    return value.isoformat()


async def _create_service_type(
    client: AsyncClient, token: str, business_id: str
) -> str:
    """Create a service type and return its id."""
    resp = await client.post(
        "/api/service-types",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "business_id": business_id,
            "name": "VIP Table",
            "capacity": 10,
            "color": "#ff0000",
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# --------------------------------------------------------------------------- #
# Reservation CRUD
# --------------------------------------------------------------------------- #


class TestReservationLifecycle:
    @pytest.mark.asyncio
    async def test_create_reservation(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        owner_token, business_id = await _create_business_owner(client)
        await _open_default_schedule(db_session, business_id)
        service_type_id = await _create_service_type(client, owner_token, business_id)

        resp = await client.post(
            "/api/reservations",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "service_type_id": service_type_id,
                "time": _future_time(1),
                "name": "Phone Guest",
                "phone": "+31612345678",
                "email": "customer@test.com",
                "guests": 4,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "pending"
        assert data["guests"] == 4
        assert data["business_id"] == business_id

    @pytest.mark.asyncio
    async def test_list_business_reservations(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        owner_token, business_id = await _create_business_owner(client)
        await _open_default_schedule(db_session, business_id)
        service_type_id = await _create_service_type(client, owner_token, business_id)
        # Create through the public guest contract, then list as staff.
        await client.post(
            "/api/reservations/public",
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": _future_time(2),
                "name": "Test Customer",
                "phone": "+31612345678",
                "email": "customer@test.com",
                "guests": 3,
            },
        )

        # List as business owner
        resp = await client.get(
            f"/api/reservations/business/{business_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["guests"] == 3


# --------------------------------------------------------------------------- #
# Public reservation (no auth)
# --------------------------------------------------------------------------- #


class TestPublicReservation:
    @pytest.mark.asyncio
    async def test_create_public_reservation(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        owner_token, business_id = await _create_business_owner(client)
        await _open_default_schedule(db_session, business_id)
        service_type_id = await _create_service_type(client, owner_token, business_id)

        resp = await client.post(
            "/api/reservations/public",
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": _future_time(3),
                "phone": "+31600000000",
                "email": "guest@example.com",
                "name": "Walk-in Guest",
                "guests": 2,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "guest@example.com"
        assert data["status"] == "pending"

    @pytest.mark.asyncio
    async def test_staff_can_create_when_public_reservations_are_disabled(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        owner_token, business_id = await _create_business_owner(client)
        await _open_default_schedule(db_session, business_id)
        service_type_id = await _create_service_type(client, owner_token, business_id)
        business = await db_session.get(Business, business_id)
        assert business is not None
        business.public_reservations_enabled = False
        await db_session.commit()

        public = await client.post(
            "/api/reservations/public",
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": _future_time(3),
                "phone": "+31600000000",
                "email": "guest@example.com",
                "name": "Walk-in Guest",
                "guests": 2,
            },
        )
        assert public.status_code == 403
        assert public.json()["code"] == "PUBLIC_RESERVATIONS_DISABLED"

        staff = await client.post(
            "/api/reservations",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "service_type_id": service_type_id,
                "time": _future_time(4),
                "phone": "+31600000001",
                "email": "staff-booked@example.com",
                "name": "Phone Guest",
                "guests": 2,
            },
        )
        assert staff.status_code == 201


# --------------------------------------------------------------------------- #
# Edge cases
# --------------------------------------------------------------------------- #


class TestReservationEdgeCases:
    @pytest.mark.asyncio
    async def test_create_reservation_unauthenticated(self, client: AsyncClient):
        resp = await client.post(
            "/api/reservations",
            json={
                "service_type_id": "00000000-0000-0000-0000-000000000000",
                "time": "2026-03-15T19:00:00",
                "name": "Guest",
                "phone": "+31600000000",
                "email": "test@test.com",
                "guests": 1,
            },
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_nonexistent_reservation(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get(
            "/api/reservations/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_delete_nonexistent_reservation(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.delete(
            "/api/reservations/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert resp.status_code == 403
