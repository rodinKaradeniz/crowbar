from datetime import datetime, time, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking_schedule import BookingSchedule, BookingScheduleWindow
from app.models.customer import Customer, CustomerMarketingConsent
from app.models.queue_entry import QueueEntry


async def _owner(client: AsyncClient, suffix: str):
    response = await client.post("/api/auth/register-business", json={
        "email": f"owner-{suffix}@example.com", "password": "password1234", "name": "Owner",
        "phone": "+4915112345678", "business_name": f"{suffix} Bar", "business_slug": f"{suffix}-bar",
    })
    assert response.status_code == 201
    token = response.json()["access_token"]
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["business_id"]


async def _open_schedule_and_service(client: AsyncClient, db: AsyncSession, token: str, business_id: str):
    schedule = await db.scalar(select(BookingSchedule).where(BookingSchedule.business_id == business_id, BookingSchedule.service_type_id.is_(None)))
    assert schedule is not None
    schedule.windows = [BookingScheduleWindow(weekday=day, start_time=time(0), end_time=time(23, 59)) for day in range(7)]
    await db.commit()
    response = await client.post("/api/service-types", headers={"Authorization": f"Bearer {token}"}, json={"business_id": business_id, "name": "Dinner", "capacity": 20, "color": "#000000"})
    assert response.status_code == 201
    return response.json()["id"]


@pytest.mark.asyncio
async def test_public_opt_ins_and_queue_share_the_phone_keyed_guest(client: AsyncClient, db_session: AsyncSession):
    token, business_id = await _owner(client, "crm")
    service_id = await _open_schedule_and_service(client, db_session, token, business_id)
    future = datetime.now(timezone.utc).replace(hour=18, minute=0, second=0, microsecond=0) + timedelta(days=2)
    created = await client.post("/api/reservations/public", json={
        "business_id": business_id, "service_type_id": service_id, "time": future.isoformat(),
        "name": "Ada Guest", "phone": "+4915112345678", "email": "ada@example.com", "guests": 2,
        "marketing_email_opt_in": True, "marketing_sms_opt_in": False,
        "idempotency_key": "crm-public-1",
    })
    assert created.status_code == 201, created.text
    guest_id = created.json()["customer_id"]

    queue_opened = await client.put(
        "/api/queue/service-day",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "open", "max_waiting_covers": 20},
    )
    assert queue_opened.status_code == 200, queue_opened.text
    joined = await client.post(
        f"/api/queue/{business_id}/join",
        json={
            "name": "Ada Guest",
            "party_size": 2,
            "phone": "+4915112345678",
            "idempotency_key": "crm-queue-join-1",
        },
    )
    assert joined.status_code == 201, joined.text
    entry = await db_session.get(QueueEntry, joined.json()["entry"]["id"])
    assert entry is not None and str(entry.customer_id) == guest_id

    profile = await client.get(f"/api/customers/{guest_id}", headers={"Authorization": f"Bearer {token}"})
    assert profile.status_code == 200, profile.text
    payload = profile.json()
    assert {item["channel"]: item["is_consented"] for item in payload["consents"]} == {"email": True, "sms": False}
    assert {item["kind"] for item in payload["timeline"]} >= {"reservation", "queue"}


@pytest.mark.asyncio
async def test_guest_dietary_provenance_and_privacy_actions_are_tenant_scoped(client: AsyncClient, db_session: AsyncSession):
    token, business_id = await _owner(client, "crm-owner")
    other_token, _ = await _owner(client, "crm-other")
    guest = Customer(business_id=business_id, name="Ada", phone="+4915122222222", email="ada@example.com")
    db_session.add(guest)
    await db_session.flush()
    guest_id = str(guest.id)
    await db_session.commit()

    missing_provenance = await client.patch(f"/api/customers/{guest_id}", headers={"Authorization": f"Bearer {token}"}, json={"dietary_details": "Peanut allergy"})
    assert missing_provenance.status_code == 422
    saved = await client.patch(f"/api/customers/{guest_id}", headers={"Authorization": f"Bearer {token}"}, json={"dietary_details": "Peanut allergy", "save_dietary_details": True, "preferences": "Quiet corner"})
    assert saved.status_code == 200, saved.text
    assert saved.json()["dietary_details_source"] == "guest_provided"

    duplicate = Customer(business_id=business_id, name="Ada Duplicate", phone="+4915133333333")
    db_session.add(duplicate)
    await db_session.flush()
    duplicate_id = str(duplicate.id)
    await db_session.commit()
    merged = await client.post(f"/api/customers/{guest_id}/merge", headers={"Authorization": f"Bearer {token}"}, json={"source_customer_id": duplicate_id})
    assert merged.status_code == 200, merged.text
    await db_session.refresh(duplicate)
    assert str(duplicate.merged_into_customer_id) == guest_id

    denied = await client.get(f"/api/customers/{guest_id}", headers={"Authorization": f"Bearer {other_token}"})
    assert denied.status_code == 404

    deleted = await client.post(f"/api/customers/{guest_id}/data-requests", headers={"Authorization": f"Bearer {token}"}, json={"request_type": "deletion"})
    assert deleted.status_code == 200, deleted.text
    await db_session.refresh(guest)
    assert guest.anonymized_at is not None
    assert guest.phone is None and guest.dietary_details is None


@pytest.mark.asyncio
async def test_later_public_choice_withdraws_prior_marketing_consent(
    client: AsyncClient, db_session: AsyncSession
):
    token, business_id = await _owner(client, "crm-withdraw")
    service_id = await _open_schedule_and_service(
        client, db_session, token, business_id
    )
    future = datetime.now(timezone.utc).replace(
        hour=18, minute=0, second=0, microsecond=0
    ) + timedelta(days=3)
    first = await client.post(
        "/api/reservations/public",
        json={
            "business_id": business_id,
            "service_type_id": service_id,
            "time": future.isoformat(),
            "name": "Consent Guest",
            "phone": "+4915333333333",
            "email": "consent@example.com",
            "guests": 2,
            "marketing_email_opt_in": True,
            "marketing_sms_opt_in": True,
            "idempotency_key": "consent-first",
        },
    )
    assert first.status_code == 201, first.text
    second = await client.post(
        "/api/reservations/public",
        json={
            "business_id": business_id,
            "service_type_id": service_id,
            "time": (future + timedelta(days=1)).isoformat(),
            "name": "Consent Guest",
            "phone": "+4915333333333",
            "email": "consent@example.com",
            "guests": 2,
            "marketing_email_opt_in": False,
            "marketing_sms_opt_in": False,
            "idempotency_key": "consent-withdraw",
        },
    )
    assert second.status_code == 201, second.text

    profile = await client.get(
        f"/api/customers/{first.json()['customer_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert profile.status_code == 200
    assert all(not item["is_consented"] for item in profile.json()["consents"])
    assert all(item["withdrawn_at"] is not None for item in profile.json()["consents"])


@pytest.mark.asyncio
async def test_customer_merge_preserves_suppression_when_profiles_disagree(
    client: AsyncClient, db_session: AsyncSession
):
    token, business_id = await _owner(client, "crm-suppression")
    target = Customer(
        business_id=business_id,
        name="Target",
        phone="+4915444444444",
    )
    source = Customer(
        business_id=business_id,
        name="Source",
        phone="+4915555555555",
    )
    db_session.add_all([target, source])
    await db_session.flush()
    db_session.add_all(
        [
            CustomerMarketingConsent(
                business_id=business_id,
                customer_id=target.id,
                channel="email",
                is_consented=True,
                source="public_reservation",
                notice_version="eu-de-v1",
            ),
            CustomerMarketingConsent(
                business_id=business_id,
                customer_id=source.id,
                channel="email",
                is_consented=False,
                source="public_reservation",
                notice_version="eu-de-v1",
                withdrawn_at=datetime.now(timezone.utc),
            ),
        ]
    )
    await db_session.commit()

    merged = await client.post(
        f"/api/customers/{target.id}/merge",
        headers={"Authorization": f"Bearer {token}"},
        json={"source_customer_id": str(source.id)},
    )

    assert merged.status_code == 200, merged.text
    consent = await db_session.scalar(
        select(CustomerMarketingConsent).where(
            CustomerMarketingConsent.customer_id == target.id,
            CustomerMarketingConsent.channel == "email",
        )
    )
    assert consent is not None
    assert consent.is_consented is False
    assert consent.withdrawn_at is not None
