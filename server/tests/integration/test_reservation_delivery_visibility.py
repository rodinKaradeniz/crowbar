"""A failed confirmation must be visible to a human, and retryable by one.

The write half landed first: a confirmation that never went out now persists a
`DeliveryAttempt` with an operator-readable `last_error`. Nothing read it back,
so a guest could book, the email could silently fail, the row could say so, and
no human being would ever see it. These tests cover the read half — the field on
the response the staff board reads, and the resend beside the waitlist's.
"""

from datetime import datetime, time, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking_schedule import BookingSchedule, BookingScheduleWindow
from app.models.business import Business
from app.models.reservation import Reservation
from app.models.reservation_delivery_attempt import ReservationDeliveryAttempt
from app.models.staff import Staff
from app.models.user import User
from app.services import email_service, reservation_service
from app.services.auth_service import create_access_token


async def _open_default_schedule(db: AsyncSession, business_id: str) -> None:
    schedule = await db.scalar(
        select(BookingSchedule).where(
            BookingSchedule.business_id == business_id,
            BookingSchedule.service_type_id.is_(None),
        )
    )
    assert schedule is not None
    schedule.windows = [
        BookingScheduleWindow(weekday=weekday, start_time=time(0, 0), end_time=time(23, 59))
        for weekday in range(7)
    ]
    await db.commit()


def _future_time(days: int) -> str:
    value = datetime.now(timezone.utc).replace(
        hour=12, minute=0, second=0, microsecond=0
    ) + timedelta(days=days)
    return value.isoformat()


async def _venue(client: AsyncClient, db_session: AsyncSession, auth_headers: dict) -> str:
    business = await db_session.scalar(
        select(Business).where(Business.slug == "test-business")
    )
    await _open_default_schedule(db_session, str(business.id))
    return str(business.id)


async def _service_type(client: AsyncClient, auth_headers: dict, business_id: str) -> str:
    resp = await client.post(
        "/api/service-types",
        headers=auth_headers,
        json={"business_id": business_id, "name": "Table", "capacity": 10},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _book(
    client: AsyncClient, auth_headers: dict, service_type_id: str, *, days: int, email: str | None
) -> dict:
    payload = {
        "service_type_id": service_type_id,
        "time": _future_time(days),
        "name": "Booked Guest",
        "phone": "+31612345678",
        "guests": 2,
    }
    if email is not None:
        payload["email"] = email
    resp = await client.post("/api/reservations", headers=auth_headers, json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _record(
    db_session: AsyncSession,
    business_id: str,
    reservation_id: str,
    *,
    message_kind: str,
    delivered: bool,
    minutes_ago: int = 0,
) -> None:
    from uuid import UUID

    attempt = await reservation_service.record_confirmation_delivery(
        db_session,
        business_id=UUID(business_id),
        reservation_id=UUID(reservation_id),
        channel="email",
        message_kind=message_kind,
        delivered=delivered,
        error=None if delivered else "Email delivery failed or is not configured",
    )
    attempt.last_attempt_at = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    await db_session.commit()


# --------------------------------------------------------------------------- #
# The read half
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_the_board_reports_the_confirmation_state_for_each_booking(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    business_id = await _venue(client, db_session, auth_headers)
    service_type_id = await _service_type(client, auth_headers, business_id)
    failed = await _book(client, auth_headers, service_type_id, days=1, email="a@example.com")
    ok = await _book(client, auth_headers, service_type_id, days=2, email="b@example.com")

    await _record(db_session, business_id, failed["id"], message_kind="created", delivered=False)
    await _record(db_session, business_id, ok["id"], message_kind="created", delivered=True)

    listing = await client.get(
        f"/api/reservations/business/{business_id}", headers=auth_headers
    )
    assert listing.status_code == 200
    states = {row["id"]: row["delivery_state"] for row in listing.json()}
    assert states[failed["id"]] == "failed"
    assert states[ok["id"]] == "delivered"


@pytest.mark.asyncio
async def test_a_booking_with_no_attempt_reads_unavailable_rather_than_null(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    business_id = await _venue(client, db_session, auth_headers)
    service_type_id = await _service_type(client, auth_headers, business_id)
    created = await _book(client, auth_headers, service_type_id, days=1, email=None)

    # The creating response itself carries the field, not a null.
    assert created["delivery_state"] == "unavailable"

    detail = await client.get(
        f"/api/reservations/{created['id']}", headers=auth_headers
    )
    assert detail.status_code == 200
    assert detail.json()["delivery_state"] == "unavailable"


@pytest.mark.asyncio
async def test_a_failed_reschedule_is_not_masked_by_a_delivered_confirmation(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    """The waitlist's any-delivered ladder would report `delivered` here.

    A reservation has two different messages. The guest was told about the
    original time and NOT about the new one, which is the failure that matters.
    """
    business_id = await _venue(client, db_session, auth_headers)
    service_type_id = await _service_type(client, auth_headers, business_id)
    booking = await _book(client, auth_headers, service_type_id, days=1, email="a@example.com")

    await _record(
        db_session, business_id, booking["id"],
        message_kind="created", delivered=True, minutes_ago=30,
    )
    await _record(
        db_session, business_id, booking["id"],
        message_kind="rescheduled", delivered=False, minutes_ago=0,
    )

    detail = await client.get(f"/api/reservations/{booking['id']}", headers=auth_headers)
    assert detail.json()["delivery_state"] == "failed"


@pytest.mark.asyncio
async def test_a_reminder_attempt_does_not_change_the_confirmation_state(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    business_id = await _venue(client, db_session, auth_headers)
    service_type_id = await _service_type(client, auth_headers, business_id)
    booking = await _book(client, auth_headers, service_type_id, days=1, email="a@example.com")

    await _record(
        db_session, business_id, booking["id"],
        message_kind="created", delivered=True, minutes_ago=30,
    )
    await _record(
        db_session, business_id, booking["id"],
        message_kind="reminder", delivered=False, minutes_ago=0,
    )

    detail = await client.get(f"/api/reservations/{booking['id']}", headers=auth_headers)
    assert detail.json()["delivery_state"] == "delivered"


# --------------------------------------------------------------------------- #
# The resend
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_retry_sends_again_and_the_response_carries_the_new_state(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict, monkeypatch
):
    business_id = await _venue(client, db_session, auth_headers)
    service_type_id = await _service_type(client, auth_headers, business_id)
    booking = await _book(client, auth_headers, service_type_id, days=1, email="a@example.com")
    await _record(db_session, business_id, booking["id"], message_kind="created", delivered=False)

    monkeypatch.setattr(
        email_service, "send_reservation_confirmation", lambda **kwargs: True
    )
    resp = await client.post(
        f"/api/reservations/{booking['id']}/delivery/retry", headers=auth_headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["delivery_state"] == "delivered"

    from uuid import UUID

    attempt = await db_session.scalar(
        select(ReservationDeliveryAttempt).where(
            ReservationDeliveryAttempt.reservation_id == UUID(booking["id"]),
            ReservationDeliveryAttempt.message_kind == "created",
        )
    )
    await db_session.refresh(attempt)
    assert attempt.status == "delivered"
    assert attempt.last_error is None
    # The same row, not a second one.
    assert attempt.attempt_count == 2


@pytest.mark.asyncio
async def test_retry_resends_the_message_kind_that_failed(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict, monkeypatch
):
    business_id = await _venue(client, db_session, auth_headers)
    service_type_id = await _service_type(client, auth_headers, business_id)
    booking = await _book(client, auth_headers, service_type_id, days=1, email="a@example.com")
    await _record(
        db_session, business_id, booking["id"],
        message_kind="created", delivered=True, minutes_ago=30,
    )
    await _record(
        db_session, business_id, booking["id"],
        message_kind="rescheduled", delivered=False, minutes_ago=0,
    )

    sent: list[str] = []

    def _capture(**kwargs):
        sent.append(kwargs["message_kind"])
        return True

    monkeypatch.setattr(email_service, "send_reservation_confirmation", _capture)
    resp = await client.post(
        f"/api/reservations/{booking['id']}/delivery/retry", headers=auth_headers
    )
    assert resp.status_code == 200
    # Not "created": resending the original would leave the reschedule failed
    # forever and the board marked.
    assert sent == ["rescheduled"]
    assert resp.json()["delivery_state"] == "delivered"


@pytest.mark.asyncio
async def test_retry_reports_409_when_the_booking_has_no_email_address(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    business_id = await _venue(client, db_session, auth_headers)
    service_type_id = await _service_type(client, auth_headers, business_id)
    booking = await _book(client, auth_headers, service_type_id, days=1, email=None)

    resp = await client.post(
        f"/api/reservations/{booking['id']}/delivery/retry", headers=auth_headers
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "DELIVERY_UNAVAILABLE"


@pytest.mark.asyncio
async def test_retry_does_not_reach_across_tenants(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    business_id = await _venue(client, db_session, auth_headers)
    service_type_id = await _service_type(client, auth_headers, business_id)
    booking = await _book(client, auth_headers, service_type_id, days=1, email="a@example.com")

    other = await client.post(
        "/api/auth/register-business",
        json={
            "email": "other-owner@example.com",
            "password": "password1234",
            "name": "Other Owner",
            "phone": "+4915199999999",
            "business_name": "Other Bar",
            "business_slug": "other-bar",
        },
    )
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    resp = await client.post(
        f"/api/reservations/{booking['id']}/delivery/retry", headers=other_headers
    )
    # Absent, not forbidden: another tenant's booking does not exist for them.
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_retry_is_refused_without_reservations_manage(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    business_id = await _venue(client, db_session, auth_headers)
    service_type_id = await _service_type(client, auth_headers, business_id)
    booking = await _book(client, auth_headers, service_type_id, days=1, email="a@example.com")

    kitchen_user = User(
        email="kitchen@example.com",
        name="Bar",
        password_hash="unused",
        user_type="staff",
    )
    db_session.add(kitchen_user)
    await db_session.flush()
    db_session.add(
        Staff(user_id=kitchen_user.id, business_id=business_id, role="bar_kitchen")
    )
    await db_session.commit()
    kitchen_headers = {
        "Authorization": f"Bearer {create_access_token(str(kitchen_user.id), 'staff')}"
    }

    resp = await client.post(
        f"/api/reservations/{booking['id']}/delivery/retry", headers=kitchen_headers
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_retry_is_refused_when_the_reservations_module_is_off(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    business_id = await _venue(client, db_session, auth_headers)
    service_type_id = await _service_type(client, auth_headers, business_id)
    booking = await _book(client, auth_headers, service_type_id, days=1, email="a@example.com")

    business = await db_session.get(Business, booking["business_id"])
    business.enabled_modules = [m for m in business.enabled_modules if m != "reservations"]
    await db_session.commit()

    resp = await client.post(
        f"/api/reservations/{booking['id']}/delivery/retry", headers=auth_headers
    )
    assert resp.status_code == 403
