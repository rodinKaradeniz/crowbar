"""Integration tests for authentication routes."""

import pytest
from httpx import AsyncClient


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
                "password": "password123",
                "name": "New User",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert data["user_type"] == "customer"
        assert data["user_id"]

    @pytest.mark.asyncio
    async def test_register_business_owner(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/register-business",
            json={
                "email": "owner@mybiz.com",
                "password": "password123",
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


# --------------------------------------------------------------------------- #
# Login
# --------------------------------------------------------------------------- #


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_valid_credentials(self, client: AsyncClient):
        # Register first
        await client.post(
            "/api/auth/register",
            json={
                "email": "login@example.com",
                "password": "password123",
                "name": "Login User",
            },
        )

        # Login
        resp = await client.post(
            "/api/auth/login",
            json={"email": "login@example.com", "password": "password123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user_type"] == "customer"

    @pytest.mark.asyncio
    async def test_login_invalid_password(self, client: AsyncClient):
        # Register first
        await client.post(
            "/api/auth/register",
            json={
                "email": "badpass@example.com",
                "password": "correctpassword",
                "name": "User",
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
        assert data["user_type"] == "customer"

    @pytest.mark.asyncio
    async def test_get_me_staff_includes_business_id(self, client: AsyncClient):
        # Register as business owner
        reg = await client.post(
            "/api/auth/register-business",
            json={
                "email": "staffme@example.com",
                "password": "pass123",
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
                "current_password": "password123",
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
