"""A slow SMS provider must not stall the event loop.

There are no Twilio credentials locally, so the provider is faked at the SDK
boundary: `messages.create` blocks the calling thread the way a hung connection
does, then raises the timeout the bounded HTTP client would raise. Everything
between the route and that fake — `send_sms`, its exception handling, and the
delivery record — is the real code.
"""

import asyncio
import time

import pytest
import requests
import twilio.rest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reservation_delivery_attempt import DeliveryAttempt
from app.services import sms_service

PROVIDER_STALL_SECONDS = 0.6


class _HungThenTimedOut:
    def __init__(self, sid, token, *, http_client=None):
        self.messages = self

    def create(self, **_params):
        time.sleep(PROVIDER_STALL_SECONDS)
        raise requests.exceptions.Timeout("provider did not answer")


async def _owner_with_sms(client: AsyncClient, db_session: AsyncSession):
    registered = await client.post("/api/auth/register-business", json={
        "email": "sms-loop@example.com",
        "password": "sms-loop-pass-0001",
        "name": "SMS Owner",
        "phone": "+4915111111112",
        "business_name": "SMS Loop Bar",
        "business_slug": "sms-loop-bar",
    })
    assert registered.status_code == 201, registered.text
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    business_id = (await client.get("/api/auth/me", headers=headers)).json()["business_id"]
    await db_session.execute(
        text("UPDATE businesses SET notification_channels = '[\"email\", \"sms\"]'::jsonb WHERE id = :id"),
        {"id": business_id},
    )
    await db_session.commit()
    return business_id, headers


@pytest.mark.asyncio
async def test_calling_a_party_keeps_the_loop_responsive_and_records_the_timeout(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    business_id, headers = await _owner_with_sms(client, db_session)
    opened = await client.put("/api/queue/service-day", headers=headers, json={
        "status": "open", "max_waiting_covers": 20,
    })
    assert opened.status_code == 200, opened.text
    walk_in = await client.post("/api/queue/entries", headers=headers, json={
        "name": "Slow Provider", "party_size": 2, "phone": "+4915112345678",
        "idempotency_key": "sms-loop-walk-in-1",
    })
    assert walk_in.status_code == 201, walk_in.text
    entry_id = (await client.get("/api/queue/entries", headers=headers)).json()[0]["id"]

    monkeypatch.setattr(sms_service.settings, "twilio_account_sid", "AC-test")
    monkeypatch.setattr(sms_service.settings, "twilio_auth_token", "token-test")
    monkeypatch.setattr(sms_service.settings, "twilio_from_number", "+15005550006")
    monkeypatch.setattr(twilio.rest, "Client", _HungThenTimedOut)

    # Another coroutine on the same loop. If the send blocked the loop, the
    # ticker would stall for the whole provider stall.
    ticks: list[float] = []
    done = asyncio.Event()

    async def ticker():
        while not done.is_set():
            ticks.append(time.monotonic())
            await asyncio.sleep(0.01)

    ticking = asyncio.create_task(ticker())
    started = time.monotonic()
    called = await client.post(f"/api/queue/entries/{entry_id}/call", headers=headers)
    elapsed = time.monotonic() - started
    done.set()
    await ticking

    assert called.status_code == 200, called.text
    assert elapsed >= PROVIDER_STALL_SECONDS, "the fake provider was never reached"
    during = [t for t in ticks if started <= t <= started + elapsed]
    gaps = [b - a for a, b in zip(during, during[1:])]
    assert len(during) > 10
    assert max(gaps) < PROVIDER_STALL_SECONDS / 2

    # The timeout is recorded the way any failed delivery already is.
    delivery = called.json()["delivery"]
    assert delivery["state"] == "failed"
    assert delivery["retryable"] is True
    assert delivery["attempt_count"] == 1
    attempt = await db_session.scalar(
        select(DeliveryAttempt).where(DeliveryAttempt.queue_entry_id == entry_id)
    )
    assert attempt.status == "failed"
    assert attempt.last_error == "SMS delivery failed or no provider is configured"
