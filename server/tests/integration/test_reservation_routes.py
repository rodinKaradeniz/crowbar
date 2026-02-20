"""Integration tests for reservation routes – full CRUD lifecycle."""

import pytest
from httpx import AsyncClient


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
            "requires_payment": False,
            "color": "#ff0000",
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _register_customer(client: AsyncClient) -> str:
    """Register a customer and return their token."""
    resp = await client.post(
        "/api/auth/register",
        json={
            "email": "customer@test.com",
            "password": "pass123",
            "name": "Test Customer",
        },
    )
    return resp.json()["access_token"]


# --------------------------------------------------------------------------- #
# Reservation CRUD
# --------------------------------------------------------------------------- #


class TestReservationLifecycle:
    @pytest.mark.asyncio
    async def test_create_reservation(self, client: AsyncClient):
        owner_token, business_id = await _create_business_owner(client)
        service_type_id = await _create_service_type(client, owner_token, business_id)
        customer_token = await _register_customer(client)

        resp = await client.post(
            "/api/reservations",
            headers={"Authorization": f"Bearer {customer_token}"},
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": "2026-03-15T19:00:00",
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
    async def test_update_reservation_status(self, client: AsyncClient):
        owner_token, business_id = await _create_business_owner(client)
        service_type_id = await _create_service_type(client, owner_token, business_id)
        customer_token = await _register_customer(client)
        cust_headers = {"Authorization": f"Bearer {customer_token}"}

        # Create
        create_resp = await client.post(
            "/api/reservations",
            headers=cust_headers,
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": "2026-03-15T20:00:00",
                "phone": "+31612345678",
                "email": "customer@test.com",
                "guests": 2,
            },
        )
        reservation_id = create_resp.json()["id"]

        # Update status to confirmed
        update_resp = await client.patch(
            f"/api/reservations/{reservation_id}",
            headers=cust_headers,
            json={"status": "confirmed"},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["status"] == "confirmed"

    @pytest.mark.asyncio
    async def test_delete_reservation(self, client: AsyncClient):
        owner_token, business_id = await _create_business_owner(client)
        service_type_id = await _create_service_type(client, owner_token, business_id)
        customer_token = await _register_customer(client)
        cust_headers = {"Authorization": f"Bearer {customer_token}"}

        # Create
        create_resp = await client.post(
            "/api/reservations",
            headers=cust_headers,
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": "2026-03-15T21:00:00",
                "phone": "+31612345678",
                "email": "customer@test.com",
                "guests": 1,
            },
        )
        reservation_id = create_resp.json()["id"]

        # Delete
        del_resp = await client.delete(
            f"/api/reservations/{reservation_id}",
            headers=cust_headers,
        )
        assert del_resp.status_code == 204

        # Verify it's gone
        get_resp = await client.get(
            f"/api/reservations/{reservation_id}",
            headers=cust_headers,
        )
        assert get_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_my_reservations(self, client: AsyncClient):
        owner_token, business_id = await _create_business_owner(client)
        service_type_id = await _create_service_type(client, owner_token, business_id)
        customer_token = await _register_customer(client)
        cust_headers = {"Authorization": f"Bearer {customer_token}"}

        # Create two reservations
        for hour in [18, 19]:
            await client.post(
                "/api/reservations",
                headers=cust_headers,
                json={
                    "business_id": business_id,
                    "service_type_id": service_type_id,
                    "time": f"2026-03-15T{hour}:00:00",
                    "phone": "+31612345678",
                    "email": "customer@test.com",
                    "guests": 2,
                },
            )

        resp = await client.get("/api/reservations/my", headers=cust_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    @pytest.mark.asyncio
    async def test_list_business_reservations(self, client: AsyncClient):
        owner_token, business_id = await _create_business_owner(client)
        service_type_id = await _create_service_type(client, owner_token, business_id)
        customer_token = await _register_customer(client)
        cust_headers = {"Authorization": f"Bearer {customer_token}"}

        # Create reservation as customer
        await client.post(
            "/api/reservations",
            headers=cust_headers,
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": "2026-03-15T20:00:00",
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
    async def test_create_public_reservation(self, client: AsyncClient):
        owner_token, business_id = await _create_business_owner(client)
        service_type_id = await _create_service_type(client, owner_token, business_id)

        resp = await client.post(
            "/api/reservations/public",
            json={
                "business_id": business_id,
                "service_type_id": service_type_id,
                "time": "2026-04-01T18:00:00",
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


# --------------------------------------------------------------------------- #
# Edge cases
# --------------------------------------------------------------------------- #


class TestReservationEdgeCases:
    @pytest.mark.asyncio
    async def test_create_reservation_unauthenticated(self, client: AsyncClient):
        resp = await client.post(
            "/api/reservations",
            json={
                "business_id": "00000000-0000-0000-0000-000000000000",
                "service_type_id": "00000000-0000-0000-0000-000000000000",
                "time": "2026-03-15T19:00:00",
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
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_nonexistent_reservation(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.delete(
            "/api/reservations/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert resp.status_code == 404
