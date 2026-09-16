"""The venue image URL is refused at the save boundary, not at the guest's page.

A remote host that `client/next.config.ts` does not declare made
`/reserve/<slug>` return 500 — a PUBLIC booking page taken down by a value an
operator typed into a settings form. The render side now degrades to the venue's
designed no-image state, but that alone would leave the owner with a silently
missing photograph and no idea why. These tests hold the other half: the owner
finds out in the form, with a sentence they can act on.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.user import User


async def _business_id(db_session: AsyncSession) -> str:
    business = await db_session.scalar(select(Business).where(Business.slug == "test-business"))
    return str(business.id)


async def _patch_image(
    client: AsyncClient, auth_headers: dict, business_id: str, value
) -> tuple[int, dict]:
    response = await client.patch(
        f"/api/businesses/{business_id}",
        headers=auth_headers,
        json={"image": value},
    )
    return response.status_code, response.json()


@pytest.mark.asyncio
async def test_an_http_image_url_is_refused_with_the_reason_the_owner_needs(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    business_id = await _business_id(db_session)
    status, body = await _patch_image(
        client, auth_headers, business_id, "http://images.example.test/venue.jpg"
    )
    assert status == 422
    # Not "Request validation failed" — the client toast renders `message`, so a
    # Pydantic field_validator here would tell the owner nothing actionable.
    assert "https" in body["message"]
    assert body["message"] != "Request validation failed"


@pytest.mark.asyncio
async def test_a_javascript_or_data_url_never_reaches_the_row(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    business_id = await _business_id(db_session)
    for hostile in (
        "javascript:alert(1)",
        "data:image/svg+xml,<svg onload=alert(1)/>",
        "//images.example.test/venue.jpg",
        "not a url at all",
    ):
        status, _ = await _patch_image(client, auth_headers, business_id, hostile)
        assert status == 422, hostile

    business = await db_session.scalar(select(Business).where(Business.slug == "test-business"))
    await db_session.refresh(business)
    assert business.image is None


@pytest.mark.asyncio
async def test_a_relative_path_is_kept_because_the_app_serves_its_own_assets(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    business_id = await _business_id(db_session)
    status, body = await _patch_image(client, auth_headers, business_id, "/venue.jpg")
    assert status == 200
    assert body["image"] == "/venue.jpg"


@pytest.mark.asyncio
async def test_a_pasted_url_with_surrounding_whitespace_is_stored_trimmed(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    business_id = await _business_id(db_session)
    status, body = await _patch_image(
        client, auth_headers, business_id, "  https://images.example.test/venue.jpg\n"
    )
    assert status == 200
    assert body["image"] == "https://images.example.test/venue.jpg"


@pytest.mark.asyncio
async def test_clearing_the_field_stores_null_rather_than_an_empty_string(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    business_id = await _business_id(db_session)
    await _patch_image(client, auth_headers, business_id, "https://images.example.test/venue.jpg")
    status, body = await _patch_image(client, auth_headers, business_id, "")
    assert status == 200
    assert body["image"] is None

    business = await db_session.scalar(select(Business).where(Business.slug == "test-business"))
    await db_session.refresh(business)
    assert business.image is None


@pytest.mark.asyncio
async def test_the_same_rule_guards_a_staff_avatar(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    """`users.avatar` is the same defect class on a staff surface."""
    refused = await client.patch(
        "/api/auth/me", headers=auth_headers, json={"avatar": "http://example.test/me.png"}
    )
    assert refused.status_code == 422
    assert "https" in refused.json()["message"]

    accepted = await client.patch(
        "/api/auth/me",
        headers=auth_headers,
        json={"avatar": "  https://example.test/me.png  "},
    )
    assert accepted.status_code == 200
    assert accepted.json()["avatar"] == "https://example.test/me.png"

    user = await db_session.scalar(select(User).where(User.email == "testuser@example.com"))
    await db_session.refresh(user)
    assert user.avatar == "https://example.test/me.png"
