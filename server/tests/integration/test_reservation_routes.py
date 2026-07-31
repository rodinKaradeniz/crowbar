"""Integration tests for reservation routes – full CRUD lifecycle."""

from datetime import datetime, time, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking_schedule import BookingSchedule, BookingScheduleWindow
from app.models.business import Business
from app.models.reservation import Reservation
from app.services.reservation_guest_token_service import issue_guest_token
from app.services.reservation_waitlist_token_service import issue_offer_token


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

    @pytest.mark.asyncio
    async def test_guest_link_cancels_and_records_late_change(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        owner_token, business_id = await _create_business_owner(client)
        await _open_default_schedule(db_session, business_id)
        service_type_id = await _create_service_type(client, owner_token, business_id)
        created = await client.post(
            "/api/reservations/public",
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": _future_time(1),
                "phone": "+31600000000",
                "email": "guest@example.com",
                "name": "Guest",
                "guests": 2,
            },
        )
        assert created.status_code == 201
        reservation = await db_session.get(Reservation, created.json()["id"])
        assert reservation is not None
        token = issue_guest_token(
            business_id=reservation.business_id,
            reservation_id=reservation.id,
            revision=reservation.guest_token_revision,
        )
        cancelled = await client.post(f"/api/reservations/public/manage/{token}/cancel")
        assert cancelled.status_code == 200, cancelled.text
        assert cancelled.json()["status"] == "cancelled"
        assert cancelled.json()["cancelled_by"] == "guest"
        assert cancelled.json()["cancelled_late"] is False

    @pytest.mark.asyncio
    async def test_staff_marks_no_show_after_grace_period(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        owner_token, business_id = await _create_business_owner(client)
        await _open_default_schedule(db_session, business_id)
        service_type_id = await _create_service_type(client, owner_token, business_id)
        created = await client.post(
            "/api/reservations",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "service_type_id": service_type_id,
                "time": _future_time(1),
                "phone": "+31600000001",
                "email": "late@example.com",
                "name": "Late guest",
                "guests": 2,
            },
        )
        reservation = await db_session.get(Reservation, created.json()["id"])
        assert reservation is not None
        reservation.time = datetime.now(timezone.utc) - timedelta(minutes=16)
        await db_session.commit()
        no_show = await client.post(
            f"/api/reservations/{reservation.id}/no-show",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"note": "No arrival"},
        )
        assert no_show.status_code == 200, no_show.text
        assert no_show.json()["status"] == "no_show"
        assert no_show.json()["no_show_note"] == "No arrival"

    @pytest.mark.asyncio
    async def test_waitlist_offer_acceptance_creates_reservation(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        owner_token, business_id = await _create_business_owner(client)
        await _open_default_schedule(db_session, business_id)
        service_type_id = await _create_service_type(client, owner_token, business_id)
        requested_time = _future_time(3)
        joined = await client.post(
            "/api/reservations/waitlist/public",
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "requested_starts_at": requested_time,
                "flexible_until": requested_time,
                "guests": 2,
                "name": "Waitlisted guest",
                "phone": "+31600000002",
                "email": "waitlist@example.com",
            },
        )
        assert joined.status_code == 201, joined.text
        offered = await client.post(
            f"/api/reservations/waitlist/{joined.json()['id']}/offer",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"reservation_time": requested_time},
        )
        assert offered.status_code == 200, offered.text
        from app.models.reservation_waitlist import ReservationWaitlistEntry
        entry = await db_session.get(ReservationWaitlistEntry, joined.json()["id"])
        assert entry is not None
        token = issue_offer_token(
            business_id=entry.business_id, entry_id=entry.id, revision=entry.offer_token_revision
        )
        accepted = await client.post(f"/api/reservations/waitlist/offers/{token}/accept")
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["status"] == "pending"


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
