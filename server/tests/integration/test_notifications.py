"""Integration tests for in-app notifications."""

import pytest
from httpx import AsyncClient


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
            "requires_payment": False,
            "color": "#00ff00",
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _register_customer(client: AsyncClient, email: str) -> str:
    resp = await client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "pass123",
            "name": "Customer",
        },
    )
    assert resp.status_code == 201
    return resp.json()["access_token"]


class TestNotificationsPublicReservation:
    @pytest.mark.asyncio
    async def test_public_reservation_creates_staff_notification(self, client: AsyncClient):
        owner_token, business_id = await _create_business_owner(client)
        service_type_id = await _create_service_type(client, owner_token, business_id)

        resp = await client.post(
            "/api/reservations/public",
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": "2026-05-01T18:00:00",
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


class TestNotificationsStaffPatch:
    @pytest.mark.asyncio
    async def test_staff_confirm_notifies_customer(self, client: AsyncClient):
        owner_token, business_id = await _create_business_owner(client)
        service_type_id = await _create_service_type(client, owner_token, business_id)
        customer_token = await _register_customer(
            client, "cust-notif-confirm@example.com"
        )
        cust_headers = {"Authorization": f"Bearer {customer_token}"}

        create_resp = await client.post(
            "/api/reservations",
            headers=cust_headers,
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": "2026-05-02T19:00:00",
                "phone": "+31611111111",
                "email": "cust-notif-confirm@example.com",
                "guests": 1,
            },
        )
        assert create_resp.status_code == 201
        reservation_id = create_resp.json()["id"]

        patch_resp = await client.patch(
            f"/api/reservations/{reservation_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"status": "confirmed"},
        )
        assert patch_resp.status_code == 200

        cust_count = await client.get(
            "/api/notifications/unread-count",
            headers=cust_headers,
        )
        assert cust_count.status_code == 200
        assert cust_count.json()["count"] >= 1

        cust_list = await client.get("/api/notifications", headers=cust_headers)
        assert cust_list.status_code == 200
        kinds = {n["kind"] for n in cust_list.json()}
        assert "reservation_confirmed" in kinds


class TestNotificationsMarkRead:
    @pytest.mark.asyncio
    async def test_mark_read_and_unread_count(self, client: AsyncClient):
        owner_token, business_id = await _create_business_owner(client)
        service_type_id = await _create_service_type(client, owner_token, business_id)

        await client.post(
            "/api/reservations/public",
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": "2026-05-03T12:00:00",
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
