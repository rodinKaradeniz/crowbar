"""Integration tests for in-app notifications."""

from datetime import datetime, time, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking_schedule import BookingSchedule, BookingScheduleWindow


async def _create_business_owner(client: AsyncClient) -> tuple[str, str]:
    reg = await client.post(
        "/api/auth/register-business",
        json={
            "email": "owner-notif@test.com",
            "password": "pass123",
            "name": "Owner",
            "phone": "+31612345678",
            "business_name": "Notif Bar",
            "business_slug": "notif-bar",
        },
    )
    assert reg.status_code == 201, reg.text
    token = reg.json()["access_token"]
    me = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    business_id = me.json()["business_id"]
    return token, business_id


async def _create_service_type(
    client: AsyncClient, token: str, business_id: str
) -> str:
    resp = await client.post(
        "/api/service-types",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "business_id": business_id,
            "name": "Table",
            "capacity": 4,
            "color": "#00ff00",
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _open_default_schedule(db: AsyncSession, business_id: str) -> None:
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
    return (
        datetime.now(timezone.utc).replace(
            hour=12, minute=0, second=0, microsecond=0
        )
        + timedelta(days=days)
    ).isoformat()


class TestNotificationsPublicReservation:
    @pytest.mark.asyncio
    async def test_public_reservation_creates_staff_notification(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        owner_token, business_id = await _create_business_owner(client)
        await _open_default_schedule(db_session, business_id)
        service_type_id = await _create_service_type(client, owner_token, business_id)

        resp = await client.post(
            "/api/reservations/public",
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": _future_time(1),
                "phone": "+31600000000",
                "email": "walkin@example.com",
                "name": "Walk-in",
                "guests": 2,
            },
        )
        assert resp.status_code == 201

        count_resp = await client.get(
            "/api/notifications/unread-count",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert count_resp.status_code == 200
        assert count_resp.json()["count"] >= 1

        list_resp = await client.get(
            "/api/notifications",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert list_resp.status_code == 200
        items = list_resp.json()
        assert len(items) >= 1
        assert items[0]["kind"] == "reservation_created"


class TestNotificationsMarkRead:
    @pytest.mark.asyncio
    async def test_mark_read_and_unread_count(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        owner_token, business_id = await _create_business_owner(client)
        await _open_default_schedule(db_session, business_id)
        service_type_id = await _create_service_type(client, owner_token, business_id)

        await client.post(
            "/api/reservations/public",
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": _future_time(2),
                "phone": "+31622222222",
                "email": "guest2@example.com",
                "name": "Guest",
                "guests": 1,
            },
        )

        list_resp = await client.get(
            "/api/notifications",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert list_resp.status_code == 200
        notif_id = list_resp.json()[0]["id"]

        patch = await client.patch(
            f"/api/notifications/{notif_id}/read",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert patch.status_code == 200
        assert patch.json()["read_at"] is not None

        count_resp = await client.get(
            "/api/notifications/unread-count",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert count_resp.json()["count"] == 0
