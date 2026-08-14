"""Integration tests for authentication routes."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking_schedule import BookingSchedule
from app.models.business import Business
from app.models.location import Location


# --------------------------------------------------------------------------- #
# Registration
# --------------------------------------------------------------------------- #


class TestRegister:
    @pytest.mark.asyncio
    async def test_register_customer(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "password1234",
                "name": "New User",
            },
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_register_business_owner(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        resp = await client.post(
            "/api/auth/register-business",
            json={
                "email": "owner@mybiz.com",
                "password": "password1234",
                "name": "Biz Owner",
                "phone": "+31612345678",
                "business_name": "My Business",
                "business_slug": "my-business",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["user_type"] == "staff"
        assert "access_token" in data

        business = await db_session.scalar(
            select(Business).where(Business.slug == "my-business")
        )
        assert business is not None
        schedule = await db_session.scalar(
            select(BookingSchedule).where(
                BookingSchedule.business_id == business.id,
                BookingSchedule.service_type_id.is_(None),
            )
        )
        assert schedule is not None
        assert schedule.windows == []
        location = await db_session.scalar(
            select(Location).where(
                Location.business_id == business.id,
                Location.is_primary.is_(True),
            )
        )
        assert location is not None
        assert location.name == "My Business"


# --------------------------------------------------------------------------- #
# Login
# --------------------------------------------------------------------------- #


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_valid_credentials(self, client: AsyncClient):
        # Register a business owner first.
        await client.post(
            "/api/auth/register-business",
            json={
                "email": "login@example.com",
                "password": "password1234",
                "name": "Login User",
                "phone": "+4915112345678",
                "business_name": "Login Business",
                "business_slug": "login-business",
            },
        )

        # Login
        resp = await client.post(
            "/api/auth/login",
            json={"email": "login@example.com", "password": "password1234"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user_type"] == "staff"

    @pytest.mark.asyncio
    async def test_login_invalid_password(self, client: AsyncClient):
        # Register first
        await client.post(
            "/api/auth/register-business",
            json={
                "email": "badpass@example.com",
                "password": "correctpassword",
                "name": "User",
                "phone": "+4915112345679",
                "business_name": "Bad Password Business",
                "business_slug": "bad-password-business",
            },
        )

        resp = await client.post(
            "/api/auth/login",
            json={"email": "badpass@example.com", "password": "wrongpassword"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "whatever"},
        )
        assert resp.status_code == 401


# --------------------------------------------------------------------------- #
# GET /me
# --------------------------------------------------------------------------- #


class TestGetMe:
    @pytest.mark.asyncio
    async def test_get_me_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_returns_user(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "testuser@example.com"
        assert data["name"] == "Test User"
        assert data["user_type"] == "staff"

    @pytest.mark.asyncio
    async def test_get_me_staff_includes_business_id(self, client: AsyncClient):
        # Register as business owner
        reg = await client.post(
            "/api/auth/register-business",
            json={
                "email": "staffme@example.com",
                "password": "password1234",
                "name": "Staff User",
                "phone": "+31600000000",
                "business_name": "Test Biz",
                "business_slug": "test-biz",
            },
        )
        token = reg.json()["access_token"]

        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["user_type"] == "staff"
        assert "business_id" in data
        assert data["role"] == "owner"

    @pytest.mark.asyncio
    async def test_websocket_token_cannot_authenticate_http_routes(
        self, client: AsyncClient
    ):
        reg = await client.post(
            "/api/auth/register-business",
            json={
                "email": "ws-token@example.com",
                "password": "password1234",
                "name": "Socket Owner",
                "phone": "+31600000001",
                "business_name": "Socket Biz",
                "business_slug": "socket-biz",
            },
        )
        access_token = reg.json()["access_token"]

        issued = await client.post(
            "/api/auth/ws-token",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert issued.status_code == 200
        assert issued.json()["expires_in"] == 120

        rejected = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {issued.json()['token']}"},
        )
        assert rejected.status_code == 401


# --------------------------------------------------------------------------- #
# Profile updates
# --------------------------------------------------------------------------- #


class TestProfileUpdate:
    @pytest.mark.asyncio
    async def test_update_profile(self, client: AsyncClient, auth_headers: dict):
        resp = await client.patch(
            "/api/auth/me",
            headers=auth_headers,
            json={"name": "Updated Name", "phone": "+31699999999"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"
        assert resp.json()["phone"] == "+31699999999"

    @pytest.mark.asyncio
    async def test_change_password(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/auth/change-password",
            headers=auth_headers,
            json={
                "current_password": "password1234",
                "new_password": "newpassword456",
            },
        )
        assert resp.status_code == 200

        # Verify new password works
        login_resp = await client.post(
            "/api/auth/login",
            json={"email": "testuser@example.com", "password": "newpassword456"},
        )
        assert login_resp.status_code == 200

    @pytest.mark.asyncio
    async def test_change_password_wrong_current(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/auth/change-password",
            headers=auth_headers,
            json={
                "current_password": "wrongpassword",
                "new_password": "newpassword456",
            },
        )
        assert resp.status_code == 400
