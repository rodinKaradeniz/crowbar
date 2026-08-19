import asyncio

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services import queue_service


async def _owner(client: AsyncClient):
    registered = await client.post("/api/auth/register-business", json={
        "email": "stage3-queue@example.com",
        "password": "password1234",
        "name": "Queue Owner",
        "phone": "+4915111111111",
        "business_name": "Stage 3 Queue",
        "business_slug": "stage-3-queue",
    })
    assert registered.status_code == 201, registered.text
    token = registered.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = await client.get("/api/auth/me", headers=headers)
    return me.json()["business_id"], headers


@pytest.mark.asyncio
async def test_queue_policy_capacity_idempotency_reason_and_delivery_truth(client: AsyncClient):
    business_id, headers = await _owner(client)

    closed = await client.get(f"/api/queue/{business_id}/service")
    assert closed.status_code == 200
    assert closed.json()["is_open"] is False

    closed_join = await client.post(f"/api/queue/{business_id}/join", json={
        "name": "First party", "party_size": 2, "idempotency_key": "closed-attempt-1",
    })
    assert closed_join.status_code == 409
    assert closed_join.json()["code"] == "QUEUE_CLOSED"

    opened = await client.put("/api/queue/service-day", headers=headers, json={
        "status": "open", "max_waiting_covers": 2,
    })
    assert opened.status_code == 200, opened.text

    request = {"name": "First party", "party_size": 2, "idempotency_key": "queue-create-001"}
    created = await client.post(f"/api/queue/{business_id}/join", json=request)
    exact_retry = await client.post(f"/api/queue/{business_id}/join", json=request)
    assert created.status_code == 201, created.text
    assert exact_retry.status_code == 200, exact_retry.text
    assert exact_retry.json()["entry"]["id"] == created.json()["entry"]["id"]

    conflicting_retry = await client.post(f"/api/queue/{business_id}/join", json={
        **request, "name": "Different party",
    })
    assert conflicting_retry.status_code == 409

    full = await client.post(f"/api/queue/{business_id}/join", json={
        "name": "Overflow", "party_size": 1, "idempotency_key": "queue-create-002",
    })
    assert full.status_code == 409
    assert full.json()["code"] == "QUEUE_FULL"

    entry_id = created.json()["entry"]["id"]
    called = await client.post(f"/api/queue/entries/{entry_id}/call", headers=headers)
    assert called.status_code == 200, called.text
    assert called.json()["status"] == "called"
    assert called.json()["delivery"]["state"] == "unavailable"

    removed = await client.post(f"/api/queue/entries/{entry_id}/remove", headers=headers, json={
        "reason_code": "no_show", "note": "Did not return to the host stand",
    })
    assert removed.status_code == 200, removed.text
    assert removed.json()["status"] == "removed"
    assert removed.json()["terminal_reason_code"] == "no_show"
    assert removed.json()["terminal_reason_note"] == "Did not return to the host stand"


@pytest.mark.asyncio
async def test_simultaneous_joins_serialize_at_the_final_cover(
    client: AsyncClient, db_session: AsyncSession
):
    business_id, headers = await _owner(client)
    opened = await client.put("/api/queue/service-day", headers=headers, json={
        "status": "open", "max_waiting_covers": 1,
    })
    assert opened.status_code == 200, opened.text

    sessions = async_sessionmaker(
        bind=db_session.bind, class_=AsyncSession, expire_on_commit=False
    )

    async def join(name: str, key: str):
        async with sessions() as session:
            try:
                state, created = await queue_service.join_queue(
                    session,
                    business_id,
                    name,
                    1,
                    None,
                    key,
                    channel="web",
                )
                await session.commit()
                return "created", created, str(state["entry"]["id"])
            except queue_service.QueuePolicyError as exc:
                await session.rollback()
                return exc.code, False, None

    outcomes = await asyncio.gather(
        join("Boundary one", "capacity-boundary-1"),
        join("Boundary two", "capacity-boundary-2"),
    )
    assert sorted(item[0] for item in outcomes) == ["QUEUE_FULL", "created"]
    assert sum(item[1] for item in outcomes) == 1
