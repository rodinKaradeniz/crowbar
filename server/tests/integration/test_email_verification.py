"""Email address verification (migration 053).

Mirrors test_staff_security.py's password-reset test: the raw token rides the
URL FRAGMENT, is exchanged for an httpOnly cookie, and the consuming route is
then called with no token in the body.
"""
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def _register(client: AsyncClient, monkeypatch, suffix: str):
    """Register an owner, returning its token and the verification URL mailed."""
    captured: dict[str, object] = {}

    def deliver(**kwargs) -> bool:
        captured.update(kwargs)
        return True

    monkeypatch.setattr("app.routers.auth.send_email_verification", deliver)
    response = await client.post(
        "/api/auth/register-business",
        json={
            "email": f"owner-{suffix}@example.com",
            "password": "password1234",
            "name": "Owner",
            "phone": "+4915112345678",
            "business_name": f"{suffix} Bar",
            "business_slug": f"{suffix}-bar",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"], captured


def _fragment_token(url: str) -> str:
    parsed = urlparse(url)
    # The token must never be in the query string: that reaches server logs and
    # the Referer header.
    assert parsed.query == ""
    return parse_qs(parsed.fragment)["token"][0]


async def _confirm(client: AsyncClient, raw_token: str):
    exchange = await client.post(
        "/api/public/capabilities/exchange",
        json={"kind": "email_verify", "token": raw_token},
    )
    assert exchange.status_code == 204, exchange.text
    return await client.post("/api/auth/verify-email")


@pytest.mark.asyncio
async def test_registration_is_unverified_can_sign_in_and_confirms(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    token, captured = await _register(client, monkeypatch, "verify")
    headers = {"Authorization": f"Bearer {token}"}

    before = await client.get("/api/auth/me", headers=headers)
    assert before.json()["email_verified"] is False
    assert before.json()["pending_email"] is None

    # Login is deliberately NOT gated on verification.
    signin = await client.post(
        "/api/auth/login",
        json={"email": "owner-verify@example.com", "password": "password1234"},
    )
    assert signin.status_code == 200

    assert captured["is_change"] is False
    confirmed = await _confirm(client, _fragment_token(captured["verify_url"]))
    assert confirmed.status_code == 200, confirmed.text

    after = await client.get("/api/auth/me", headers=headers)
    assert after.json()["email_verified"] is True
    # Confirming a registration address changes no credential, so the session
    # that clicked the link is still good.
    assert after.status_code == 200

    user = await db_session.scalar(
        select(User).where(User.email == "owner-verify@example.com")
    )
    await db_session.refresh(user)
    assert user.session_version == 1


@pytest.mark.asyncio
async def test_verification_token_is_single_use(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    _, captured = await _register(client, monkeypatch, "single")
    raw = _fragment_token(captured["verify_url"])
    assert (await _confirm(client, raw)).status_code == 200

    replay = await client.post(
        "/api/public/capabilities/exchange",
        json={"kind": "email_verify", "token": raw},
    )
    assert replay.status_code == 404


@pytest.mark.asyncio
async def test_change_email_does_not_take_effect_until_confirmed(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    token, _ = await _register(client, monkeypatch, "change")
    headers = {"Authorization": f"Bearer {token}"}

    captured: dict[str, object] = {}

    def deliver(**kwargs) -> bool:
        captured.update(kwargs)
        return True

    monkeypatch.setattr("app.routers.auth.send_email_verification", deliver)
    requested = await client.post(
        "/api/auth/change-email",
        headers=headers,
        json={"new_email": "moved-change@example.com", "password": "password1234"},
    )
    assert requested.status_code == 202, requested.text
    assert requested.json()["pending_email"] == "moved-change@example.com"
    assert captured["is_change"] is True
    assert captured["to_email"] == "moved-change@example.com"

    # THE ACCOUNT HAS NOT MOVED.
    user = await db_session.scalar(
        select(User).where(User.email == "owner-change@example.com")
    )
    assert user is not None
    await db_session.refresh(user)
    assert user.session_version == 1

    still_old = await client.post(
        "/api/auth/login",
        json={"email": "owner-change@example.com", "password": "password1234"},
    )
    assert still_old.status_code == 200
    not_yet_new = await client.post(
        "/api/auth/login",
        json={"email": "moved-change@example.com", "password": "password1234"},
    )
    assert not_yet_new.status_code == 401

    pending = await client.get("/api/auth/me", headers=headers)
    assert pending.json()["email"] == "owner-change@example.com"
    assert pending.json()["pending_email"] == "moved-change@example.com"

    # Confirm, and only now does it move.
    assert (await _confirm(client, _fragment_token(captured["verify_url"]))).status_code == 200

    await db_session.refresh(user)
    assert user.email == "moved-change@example.com"
    # The bump moved with the write, so sessions opened before it are gone.
    assert user.session_version == 2
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 401
    moved = await client.post(
        "/api/auth/login",
        json={"email": "moved-change@example.com", "password": "password1234"},
    )
    assert moved.status_code == 200


@pytest.mark.asyncio
async def test_change_email_rejects_an_address_another_account_holds(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    await _register(client, monkeypatch, "taken-a")
    token, _ = await _register(client, monkeypatch, "taken-b")

    clash = await client.post(
        "/api/auth/change-email",
        headers={"Authorization": f"Bearer {token}"},
        json={"new_email": "owner-taken-a@example.com", "password": "password1234"},
    )
    assert clash.status_code == 409


@pytest.mark.asyncio
async def test_invited_staff_are_verified_on_accept_and_never_asked(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    token, _ = await _register(client, monkeypatch, "invited")
    captured: dict[str, str] = {}

    def deliver(**kwargs) -> bool:
        captured["url"] = kwargs["invite_url"]
        return True

    monkeypatch.setattr("app.routers.staff.send_staff_invitation", deliver)
    invited = await client.post(
        "/api/staff/invite",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "newhost-invited@example.com", "role": "host_server"},
    )
    assert invited.status_code in (200, 201), invited.text

    raw = _fragment_token(captured["url"])
    exchange = await client.post(
        "/api/public/capabilities/exchange",
        json={"kind": "staff_invite", "token": raw},
    )
    assert exchange.status_code == 204
    accepted = await client.post(
        "/api/staff/invite/accept",
        json={"name": "New Host", "password": "password1234"},
    )
    assert accepted.status_code == 201, accepted.text

    user = await db_session.scalar(
        select(User).where(User.email == "newhost-invited@example.com")
    )
    # They already proved control by clicking a link mailed to this address.
    assert user.email_verified_at is not None
    me = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {accepted.json()['access_token']}"},
    )
    assert me.json()["email_verified"] is True
