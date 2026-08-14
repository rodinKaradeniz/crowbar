from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.staff import Staff
from app.models.user import User
from app.services.auth_service import create_access_token, hash_password


async def _owner(client: AsyncClient, suffix: str) -> tuple[str, str, str]:
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
    token = response.json()["access_token"]
    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    return token, me.json()["business_id"], me.json()["id"]


async def _staff_user(
    db: AsyncSession, *, business_id: str, role: str, suffix: str
) -> tuple[User, Staff, str]:
    user = User(
        email=f"{role}-{suffix}@example.com",
        name=role.title(),
        password_hash=hash_password("password1234"),
        user_type="staff",
    )
    db.add(user)
    await db.flush()
    assignment = Staff(user_id=user.id, business_id=business_id, role=role)
    db.add(assignment)
    await db.commit()
    return (
        user,
        assignment,
        create_access_token(str(user.id), "staff", user.session_version),
    )


@pytest.mark.asyncio
async def test_manager_cannot_manage_owner_or_invite_manager(
    client: AsyncClient, db_session: AsyncSession
):
    owner_token, business_id, _ = await _owner(client, "hierarchy")
    _, _, manager_token = await _staff_user(
        db_session, business_id=business_id, role="manager", suffix="hierarchy"
    )
    members = await client.get(
        f"/api/staff/business/{business_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    owner = next(item for item in members.json() if item["role"] == "owner")

    role_change = await client.patch(
        f"/api/staff/{owner['id']}",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"role": "staff"},
    )
    invite = await client.post(
        "/api/staff/invite",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"email": "new-manager@example.com", "role": "manager"},
    )

    assert role_change.status_code == 403
    assert invite.status_code == 403


@pytest.mark.asyncio
async def test_staff_removal_revokes_existing_session_and_is_tenant_scoped(
    client: AsyncClient, db_session: AsyncSession
):
    owner_token, business_id, _ = await _owner(client, "removal")
    _, assignment, staff_token = await _staff_user(
        db_session, business_id=business_id, role="staff", suffix="removal"
    )
    assignment_id = str(assignment.id)
    other_owner_token, _, _ = await _owner(client, "removal-other")

    cross_tenant = await client.delete(
        f"/api/staff/{assignment_id}",
        headers={"Authorization": f"Bearer {other_owner_token}"},
    )
    removed = await client.delete(
        f"/api/staff/{assignment_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    stale_session = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {staff_token}"}
    )

    assert cross_tenant.status_code == 404
    assert removed.status_code == 204
    assert stale_session.status_code == 401


@pytest.mark.asyncio
async def test_invitation_is_single_use_and_delivery_status_is_truthful(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    owner_token, _, _ = await _owner(client, "invite")
    captured: dict[str, str] = {}

    def deliver(**kwargs) -> bool:
        captured["url"] = kwargs["invite_url"]
        return True

    monkeypatch.setattr("app.routers.staff.send_staff_invitation", deliver)
    invited = await client.post(
        "/api/staff/invite",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"email": "invited@example.com", "role": "staff"},
    )
    assert invited.status_code == 201, invited.text
    assert invited.json()["delivery_status"] == "sent"
    raw_token = urlparse(captured["url"]).path.rsplit("/", 1)[-1]

    accepted = await client.post(
        f"/api/staff/invite/{raw_token}/accept",
        json={"name": "Invited", "password": "password1234"},
    )
    replay = await client.post(
        f"/api/staff/invite/{raw_token}/accept",
        json={"name": "Invited", "password": "password1234"},
    )

    assert accepted.status_code == 201, accepted.text
    assert replay.status_code == 410


@pytest.mark.asyncio
async def test_password_reset_is_generic_single_use_and_revokes_sessions(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    owner_token, _, _ = await _owner(client, "reset")
    captured: dict[str, str] = {}

    def deliver(**kwargs) -> bool:
        captured["url"] = kwargs["reset_url"]
        return True

    monkeypatch.setattr("app.routers.auth.send_password_reset", deliver)
    existing = await client.post(
        "/api/auth/forgot-password",
        json={"email": "owner-reset@example.com"},
    )
    missing = await client.post(
        "/api/auth/forgot-password",
        json={"email": "missing-reset@example.com"},
    )
    assert existing.status_code == missing.status_code == 202
    assert existing.json() == missing.json()

    raw_token = parse_qs(urlparse(captured["url"]).query)["token"][0]
    reset = await client.post(
        "/api/auth/reset-password",
        json={"token": raw_token, "new_password": "new-password-1234"},
    )
    stale_session = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {owner_token}"}
    )
    replay = await client.post(
        "/api/auth/reset-password",
        json={"token": raw_token, "new_password": "another-password-1234"},
    )

    assert reset.status_code == 200, reset.text
    assert stale_session.status_code == 401
    assert replay.status_code == 400
