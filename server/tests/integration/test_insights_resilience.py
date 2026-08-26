"""ML is optional, so its absence degrades a dashboard and nothing more.

Before stage 6, every Insights panel returned 503 the moment the ML service was
unreachable, and the ML service kept its results in process memory — so an
ordinary restart blanked the page with an error that looked like a Crowbar
fault. These tests pin the replacement behaviour: remember the last live answer,
serve it marked stale, and say plainly when there is nothing to remember.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.ml import MLResultSnapshot
from app.models.staff import Staff
from app.models.user import User
from app.routers import insights
from app.services import ml_snapshot_service
from app.services.auth_service import create_access_token, hash_password


async def _manager(db: AsyncSession, *, slug: str) -> tuple[str, str]:
    user = User(
        email=f"{slug}@example.com",
        name="Insights manager",
        password_hash=hash_password("test-password-1234"),
        user_type="staff",
    )
    db.add(user)
    await db.flush()
    business = Business(
        name=f"Venue {slug}",
        slug=slug,
        email=f"venue-{slug}@example.com",
        phone="5550000000",
        enabled_modules=["reservations", "insights"],
        currency_code="EUR",
        onboarding_complete=True,
    )
    db.add(business)
    await db.flush()
    db.add(Staff(user_id=user.id, business_id=business.id, role="manager"))
    await db.flush()
    business_id, user_id = str(business.id), str(user.id)
    await db.commit()
    return business_id, create_access_token(user_id, "staff")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def ml_answers(monkeypatch):
    """Stand in for the private ML service.

    Patched at `_request_ml` rather than at the HTTP client because the contract
    under test is "what does the router do with a reachable/unreachable
    service", not "how does httpx report a refused connection".
    """
    state = {"reachable": True, "payload": {"status": "success", "segments": 3}}

    async def fake_request(method, business_id, path, *, timeout_seconds=15):
        if not state["reachable"]:
            raise insights.MLUnavailable("connection refused")
        return state["payload"]

    monkeypatch.setattr(insights, "_request_ml", fake_request)
    return state


@pytest.mark.asyncio
async def test_a_live_result_is_returned_and_remembered(
    client: AsyncClient, db_session: AsyncSession, ml_answers
):
    business_id, token = await _manager(db_session, slug="insights-live")

    response = await client.get("/api/insights/segmentation", headers=_auth(token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["segments"] == 3
    # A live answer says so, so the client never has to guess.
    assert body["stale"] is False

    snapshot = await db_session.scalar(
        select(MLResultSnapshot).where(
            MLResultSnapshot.business_id == UUID(business_id),
            MLResultSnapshot.resource == "segmentation",
        )
    )
    assert snapshot is not None
    assert snapshot.payload["segments"] == 3


@pytest.mark.asyncio
async def test_an_outage_serves_the_last_result_marked_stale(
    client: AsyncClient, db_session: AsyncSession, ml_answers
):
    """The dashboard survives a restart, and says that it is remembering."""
    _business_id, token = await _manager(db_session, slug="insights-stale")

    live = await client.get("/api/insights/segmentation", headers=_auth(token))
    assert live.status_code == 200

    ml_answers["reachable"] = False
    degraded = await client.get("/api/insights/segmentation", headers=_auth(token))

    assert degraded.status_code == 200, "an ML outage must not error the dashboard"
    body = degraded.json()
    assert body["segments"] == 3, "the remembered figure is still shown"
    assert body["stale"] is True
    assert body["captured_at"] is not None
    # A stale figure shown as live is the defect; the reason has to be readable.
    assert "unreachable" in body["unavailable_reason"].lower()


@pytest.mark.asyncio
async def test_an_outage_with_nothing_remembered_is_an_honest_empty_state(
    client: AsyncClient, db_session: AsyncSession, ml_answers
):
    """No 503. "No results yet" is true and actionable; an error page is not."""
    _business_id, token = await _manager(db_session, slug="insights-empty")
    ml_answers["reachable"] = False

    response = await client.get("/api/insights/demand", headers=_auth(token))
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["stale"] is True
    assert body["captured_at"] is None
    assert body["resource"] == "demand"


@pytest.mark.asyncio
async def test_triggering_a_run_during_an_outage_still_fails_loudly(
    client: AsyncClient, db_session: AsyncSession, ml_answers
):
    """A degraded read is honest; a degraded write would be a lie.

    There is nothing to remember about a pipeline run that never started, so
    this is the one Insights route that keeps its 503 — the operator asked for
    something to happen, and it did not.
    """
    _business_id, token = await _manager(db_session, slug="insights-run")
    ml_answers["reachable"] = False

    response = await client.post("/api/insights/run", headers=_auth(token))
    assert response.status_code == 503
    assert response.json()["code"] == "INTERNAL_ERROR"


@pytest.mark.asyncio
async def test_a_newer_result_replaces_the_remembered_one(
    client: AsyncClient, db_session: AsyncSession, ml_answers
):
    """One row per tenant and resource: a history of payloads has no reader."""
    business_id, token = await _manager(db_session, slug="insights-replace")

    await client.get("/api/insights/segmentation", headers=_auth(token))
    ml_answers["payload"] = {"status": "success", "segments": 9}
    await client.get("/api/insights/segmentation", headers=_auth(token))

    snapshots = (
        await db_session.scalars(
            select(MLResultSnapshot).where(
                MLResultSnapshot.business_id == UUID(business_id),
                MLResultSnapshot.resource == "segmentation",
            )
        )
    ).all()
    assert len(snapshots) == 1
    assert snapshots[0].payload["segments"] == 9


@pytest.mark.asyncio
async def test_snapshots_are_tenant_scoped(
    client: AsyncClient, db_session: AsyncSession, ml_answers
):
    """One venue's remembered figures must never surface on another's dashboard."""
    _a_id, a_token = await _manager(db_session, slug="insights-tenant-a")
    _b_id, b_token = await _manager(db_session, slug="insights-tenant-b")

    ml_answers["payload"] = {"status": "success", "segments": 7}
    await client.get("/api/insights/segmentation", headers=_auth(a_token))

    ml_answers["reachable"] = False
    b_response = await client.get("/api/insights/segmentation", headers=_auth(b_token))

    assert b_response.status_code == 200
    body = b_response.json()
    assert body["captured_at"] is None, "business B saw business A's remembered result"
    assert body["status"] == "unavailable"


@pytest.mark.asyncio
async def test_a_reachable_service_returning_an_error_is_not_masked(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    """An error *response* is a real answer and must reach the operator.

    Serving a stale figure in place of a 500 from a reachable service would hide
    a genuine fault behind a number that looks fine.
    """
    from app.core.errors import ErrorCode, api_error

    _business_id, token = await _manager(db_session, slug="insights-error")

    async def failing(method, business_id, path, *, timeout_seconds=15):
        raise api_error(500, ErrorCode.INTERNAL_ERROR, "Model artifacts are corrupt")

    monkeypatch.setattr(insights, "_request_ml", failing)

    response = await client.get("/api/insights/status", headers=_auth(token))
    assert response.status_code == 500
    assert "corrupt" in response.json()["message"]


@pytest.mark.asyncio
async def test_the_snapshot_service_refuses_an_unknown_resource(
    db_session: AsyncSession,
):
    """The resource vocabulary is closed, matching the database constraint."""
    business_id, _token = await _manager(db_session, slug="insights-unknown")
    with pytest.raises(ml_snapshot_service.MLSnapshotError):
        await ml_snapshot_service.record(
            db_session, UUID(business_id), "revenue_forecast", {"x": 1}
        )


@pytest.mark.asyncio
async def test_high_risk_reservations_answer_rather_than_erroring(
    client: AsyncClient, db_session: AsyncSession
):
    """`ml_predictions` is now mapped, so this route has a table to read.

    It returns an empty list because nothing writes cancellation-risk rows yet —
    the pipeline only produces customer segmentation. That gap is recorded in
    `docs/TODO.md`; what must not happen is a 500 from a missing relation.
    """
    business_id, token = await _manager(db_session, slug="insights-high-risk")
    response = await client.get(
        f"/api/analytics/business/{business_id}/high-risk", headers=_auth(token)
    )
    assert response.status_code == 200, response.text
    assert response.json() == []
