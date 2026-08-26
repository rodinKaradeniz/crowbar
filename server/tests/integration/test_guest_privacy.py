"""A guest can act on their own data, and nobody else can act on it for them.

This surface is reachable without a staff session, so the interesting tests are
the refusals: a forged signature, a revoked link, a link for another venue's
reservation. All of them must fail the same way, because a surface that answers
differently for "expired" and "never existed" is a surface that can be probed.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.customer import CustomerDataRequest, CustomerMarketingConsent
from app.models.customer import Customer
from app.models.reservation import Reservation
from app.models.service_type import ServiceType
from app.services import marketing_consent_service
from app.services.reservation_guest_token_service import issue_guest_token

NOW = datetime.now(timezone.utc)


async def _booked_guest(
    db: AsyncSession, *, slug: str, consented: bool = True
) -> tuple[Business, Customer, Reservation, str]:
    business = Business(
        name=f"Venue {slug}",
        slug=slug,
        email=f"venue-{slug}@example.com",
        phone="5550000000",
        enabled_modules=["reservations", "queue", "ordering"],
        currency_code="EUR",
        onboarding_complete=True,
        privacy_contact="privacy@example.com",
        privacy_policy_url="https://example.com/privacy",
    )
    db.add(business)
    await db.flush()

    service_type = ServiceType(
        business_id=business.id,
        name="Table",
        capacity=4,
        max_concurrent_bookings=2,
        duration=60,
    )
    customer = Customer(
        business_id=business.id,
        name="Booked Guest",
        phone="+4915100000009",
        email=f"guest-{slug}@example.com",
    )
    db.add_all([service_type, customer])
    await db.flush()

    for channel in ["email", "sms"]:
        db.add(
            CustomerMarketingConsent(
                business_id=business.id,
                customer_id=customer.id,
                channel=channel,
                is_consented=consented,
                source="public_reservation",
                notice_version="eu-de-v1",
            )
        )

    starts_at = NOW + timedelta(days=1)
    reservation = Reservation(
        business_id=business.id,
        service_type_id=service_type.id,
        customer_id=customer.id,
        phone="+4915100000009",
        email=f"guest-{slug}@example.com",
        time=starts_at,
        ends_at=starts_at + timedelta(hours=1),
        guests=2,
        status="confirmed",
    )
    db.add(reservation)
    await db.flush()

    token = issue_guest_token(
        business_id=business.id,
        reservation_id=reservation.id,
        revision=reservation.guest_token_revision,
    )
    await db.commit()
    return business, customer, reservation, token


async def _hold_capability(client: AsyncClient, token: str) -> None:
    """Exchange the signed link for the HttpOnly cookie, as a browser would."""
    response = await client.post(
        "/api/public/capabilities/exchange",
        json={"kind": "reservation", "token": token},
    )
    assert response.status_code == 204, response.text


@pytest.mark.asyncio
async def test_a_guest_can_see_what_consent_the_venue_holds(
    client: AsyncClient, db_session: AsyncSession
):
    _business, _customer, _reservation, token = await _booked_guest(
        db_session, slug="privacy-state"
    )
    await _hold_capability(client, token)

    response = await client.get("/api/public/privacy")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["marketing_consent"] == {"email": True, "sms": True}
    assert body["privacy_contact"] == "privacy@example.com"

    # Consent only. A stolen link must not become a way to read someone's
    # visit history.
    assert "name" not in body
    assert "reservations" not in body
    assert "timeline" not in body


@pytest.mark.asyncio
async def test_a_guest_can_withdraw_consent_and_it_takes_effect_immediately(
    client: AsyncClient, db_session: AsyncSession
):
    business, customer, _reservation, token = await _booked_guest(
        db_session, slug="privacy-withdraw"
    )
    await _hold_capability(client, token)

    response = await client.post(
        "/api/public/privacy/requests", json={"request_type": "withdraw_consent"}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "completed"
    assert sorted(body["withdrawn_channels"]) == ["email", "sms"]

    # The record is a withdrawal, not a deletion — `withdrawn_at` is the
    # evidence that the venue honoured it.
    consents = (
        await db_session.scalars(
            select(CustomerMarketingConsent).where(
                CustomerMarketingConsent.customer_id == customer.id
            )
        )
    ).all()
    assert len(consents) == 2
    for consent in consents:
        assert consent.is_consented is False
        assert consent.withdrawn_at is not None

    # And it actually suppresses a marketing send now.
    for channel in ["email", "sms"]:
        assert await marketing_consent_service.is_suppressed(
            db_session,
            business_id=business.id,
            customer_id=customer.id,
            channel=channel,
            message_class="marketing",
        )


@pytest.mark.asyncio
async def test_withdrawal_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
):
    """A guest clicking twice is a guest, not an error."""
    _business, _customer, _reservation, token = await _booked_guest(
        db_session, slug="privacy-twice"
    )
    await _hold_capability(client, token)

    first = await client.post(
        "/api/public/privacy/requests", json={"request_type": "withdraw_consent"}
    )
    second = await client.post(
        "/api/public/privacy/requests", json={"request_type": "withdraw_consent"}
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["withdrawn_channels"] == []
    assert second.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_an_access_request_is_recorded_as_pending_not_completed(
    client: AsyncClient, db_session: AsyncSession
):
    """Only withdrawal completes itself.

    An access or deletion request needs a person to assemble or verify
    something. Marking it completed on receipt would be a false completion —
    the guest would be told their request was handled when nobody had looked.
    """
    business, customer, _reservation, token = await _booked_guest(
        db_session, slug="privacy-access"
    )
    await _hold_capability(client, token)

    response = await client.post(
        "/api/public/privacy/requests",
        json={"request_type": "export", "note": "Please send everything you hold."},
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "pending"

    recorded = await db_session.scalar(
        select(CustomerDataRequest).where(
            CustomerDataRequest.customer_id == customer.id
        )
    )
    assert recorded is not None
    assert recorded.business_id == business.id
    assert recorded.status == "pending"
    assert recorded.completed_at is None
    # No staff member raised this, and the row says so.
    assert recorded.requested_by is None
    assert "Please send everything you hold." in recorded.detail


@pytest.mark.asyncio
async def test_every_invalid_capability_fails_identically(
    client: AsyncClient, db_session: AsyncSession
):
    """Expired, forged, revoked and nonexistent must be indistinguishable."""
    _business, _customer, reservation, token = await _booked_guest(
        db_session, slug="privacy-forged"
    )

    async def attempt() -> tuple[int, str]:
        response = await client.post(
            "/api/public/privacy/requests", json={"request_type": "withdraw_consent"}
        )
        return response.status_code, response.json()["message"]

    # 1. No capability at all.
    no_cookie = await attempt()
    assert no_cookie == (404, "This link is no longer valid")

    # 2. A forged signature over a real reservation id.
    forged = f"{token.split('.')[0]}.{'A' * 43}" if "." in token else f"{token}tampered"
    exchange = await client.post(
        "/api/public/capabilities/exchange",
        json={"kind": "reservation", "token": forged},
    )
    assert exchange.status_code == 404
    assert exchange.json()["message"] == "This link is no longer valid"

    # 3. A signature for a reservation that does not exist.
    ghost = issue_guest_token(
        business_id=reservation.business_id,
        reservation_id=uuid4(),
        revision=1,
    )
    exchange = await client.post(
        "/api/public/capabilities/exchange",
        json={"kind": "reservation", "token": ghost},
    )
    assert exchange.status_code == 404
    assert exchange.json()["message"] == "This link is no longer valid"


@pytest.mark.asyncio
async def test_a_revoked_link_cannot_act_even_with_the_cookie_held(
    client: AsyncClient, db_session: AsyncSession
):
    """Revision binding is the revocation mechanism, and it must hold per-use.

    A guest who exchanged their link before it was revoked still holds the
    cookie. Checking the revision only at exchange time would let that cookie
    keep working for its full 12 hours.
    """
    _business, _customer, reservation, token = await _booked_guest(
        db_session, slug="privacy-revoked"
    )
    await _hold_capability(client, token)

    # The venue rotates the link — e.g. after the guest reported it shared.
    reservation.guest_token_revision += 1
    db_session.add(reservation)
    await db_session.commit()

    response = await client.post(
        "/api/public/privacy/requests", json={"request_type": "withdraw_consent"}
    )
    assert response.status_code == 404
    assert response.json()["message"] == "This link is no longer valid"


@pytest.mark.asyncio
async def test_a_guest_cannot_act_on_another_venues_reservation(
    client: AsyncClient, db_session: AsyncSession
):
    """The signature binds the business, so a cross-tenant token cannot resolve."""
    _a_business, _a_customer, a_reservation, _a_token = await _booked_guest(
        db_session, slug="privacy-tenant-a"
    )
    b_business, _b_customer, _b_reservation, _b_token = await _booked_guest(
        db_session, slug="privacy-tenant-b"
    )

    # A's reservation id, signed as though it belonged to B.
    crossed = issue_guest_token(
        business_id=b_business.id,
        reservation_id=a_reservation.id,
        revision=a_reservation.guest_token_revision,
    )
    exchange = await client.post(
        "/api/public/capabilities/exchange",
        json={"kind": "reservation", "token": crossed},
    )
    assert exchange.status_code == 404


@pytest.mark.asyncio
async def test_consent_suppresses_marketing_but_never_operational_messages(
    client: AsyncClient, db_session: AsyncSession
):
    """The rule the stage settled on, asserted directly.

    A guest who opts out of marketing must still be told their table is ready.
    Suppressing operational messages would be worse for the guest, not better.
    """
    business, customer, _reservation, token = await _booked_guest(
        db_session, slug="privacy-classes"
    )
    await _hold_capability(client, token)
    await client.post(
        "/api/public/privacy/requests", json={"request_type": "withdraw_consent"}
    )

    for channel in ["email", "sms"]:
        assert (
            await marketing_consent_service.is_suppressed(
                db_session,
                business_id=business.id,
                customer_id=customer.id,
                channel=channel,
                message_class="marketing",
            )
            is True
        ), f"marketing on {channel} was not suppressed"

        assert (
            await marketing_consent_service.is_suppressed(
                db_session,
                business_id=business.id,
                customer_id=customer.id,
                channel=channel,
                message_class="operational",
            )
            is False
        ), f"an operational message on {channel} was wrongly suppressed"


@pytest.mark.asyncio
async def test_marketing_is_opt_in_so_no_record_means_no_consent(
    db_session: AsyncSession,
):
    business = Business(
        name="Opt-in venue",
        slug="privacy-optin",
        email="optin@example.com",
        phone="5550000000",
        enabled_modules=["reservations"],
        currency_code="EUR",
    )
    db_session.add(business)
    await db_session.flush()
    customer = Customer(
        business_id=business.id, name="Never asked", phone="+4915100000010"
    )
    db_session.add(customer)
    await db_session.commit()

    assert await marketing_consent_service.is_suppressed(
        db_session,
        business_id=business.id,
        customer_id=customer.id,
        channel="email",
        message_class="marketing",
    )
    # And a send with no guest identity at all has nowhere to honour a
    # withdrawal, so it is suppressed too.
    assert await marketing_consent_service.is_suppressed(
        db_session,
        business_id=business.id,
        customer_id=None,
        channel="email",
        message_class="marketing",
    )


def test_the_low_level_sender_refuses_to_send_marketing():
    """A synchronous sender cannot check consent, so it must not try.

    This is what stops a future campaign from being written as a loop over
    `send_sms`. The only way to send marketing is the async path that takes a
    session and checks the record.
    """
    from app.services import sms_service

    with pytest.raises(ValueError, match="send_marketing_sms"):
        sms_service.send_sms("+4915100000011", "Half price cocktails!", message_class="marketing")
