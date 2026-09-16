"""A reservation confirmation that never went out must leave a trace.

Verified before this test existed: a guest booking returned 201 `confirmed`,
the row was correct, no email went out, and there was NO `DeliveryAttempt` row,
no response field and only a `logger.debug`. Queue "table ready", waitlist
offers and the reminder job all recorded their outcome; the confirmation — the
first message a guest is promised — was the one that did not.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.customer import Customer
from app.models.reservation import Reservation
from app.models.reservation_delivery_attempt import ReservationDeliveryAttempt
from app.models.service_type import ServiceType
from app.services import reservation_service


async def _seed(db_session: AsyncSession) -> tuple[Business, Reservation]:
    business = Business(
        name="Confirmation Bar",
        slug="confirmation-bar",
        email="bar@example.com",
        phone="+4930123457",
        timezone="Europe/Berlin",
        enabled_modules=["reservations"],
        notification_channels=["email"],
    )
    db_session.add(business)
    await db_session.flush()

    service = ServiceType(
        business_id=business.id, name="Table", capacity=4, duration=60
    )
    customer = Customer(
        business_id=business.id,
        name="Guest",
        phone="+4915122222222",
        email="guest@example.com",
    )
    db_session.add_all([service, customer])
    await db_session.flush()

    when = datetime.now(timezone.utc) + timedelta(days=1)
    reservation = Reservation(
        business_id=business.id,
        customer_id=customer.id,
        service_type_id=service.id,
        time=when,
        ends_at=when + timedelta(hours=1),
        phone=customer.phone,
        email=customer.email,
        guests=2,
        status="confirmed",
    )
    db_session.add(reservation)
    await db_session.flush()
    return business, reservation


@pytest.mark.asyncio
async def test_failed_confirmation_records_an_attempt_an_operator_can_see(
    db_session: AsyncSession,
):
    business, reservation = await _seed(db_session)

    await reservation_service.record_confirmation_delivery(
        db_session,
        business_id=business.id,
        reservation_id=reservation.id,
        channel="email",
        message_kind="created",
        delivered=False,
    )

    attempt = await db_session.scalar(
        select(ReservationDeliveryAttempt).where(
            ReservationDeliveryAttempt.reservation_id == reservation.id
        )
    )
    assert attempt is not None, "a confirmation that did not send must leave a row"
    assert attempt.status == "failed"
    assert attempt.attempt_count == 1
    assert attempt.delivered_at is None
    # The operator-visible half: a reason, not just a status.
    assert attempt.last_error
    assert attempt.business_id == business.id
    assert attempt.message_kind == "created"
    assert attempt.channel == "email"


@pytest.mark.asyncio
async def test_a_later_send_updates_the_same_row_rather_than_adding_one(
    db_session: AsyncSession,
):
    """The partial unique index is on (reservation_id, message_kind, channel).

    A staff confirmation after a pending booking, or a resend, must not
    accumulate a row per attempt — the operator wants the current state and a
    count, which is exactly what the reminder job produces.
    """
    business, reservation = await _seed(db_session)

    for _ in range(2):
        await reservation_service.record_confirmation_delivery(
            db_session,
            business_id=business.id,
            reservation_id=reservation.id,
            channel="email",
            message_kind="created",
            delivered=False,
        )

    attempts = (
        await db_session.scalars(
            select(ReservationDeliveryAttempt).where(
                ReservationDeliveryAttempt.reservation_id == reservation.id
            )
        )
    ).all()
    assert len(attempts) == 1
    assert attempts[0].attempt_count == 2

    # And a success clears the error rather than leaving a stale one behind.
    await reservation_service.record_confirmation_delivery(
        db_session,
        business_id=business.id,
        reservation_id=reservation.id,
        channel="email",
        message_kind="created",
        delivered=True,
    )
    await db_session.refresh(attempts[0])
    assert attempts[0].status == "delivered"
    assert attempts[0].delivered_at is not None
    assert attempts[0].last_error is None
    assert attempts[0].attempt_count == 3


@pytest.mark.asyncio
async def test_a_reschedule_is_a_separate_message_from_the_first_confirmation(
    db_session: AsyncSession,
):
    """`created` and `rescheduled` are different messages to the guest.

    They are separate rows by design, so an operator can see that the booking
    confirmed but the change notice did not.
    """
    business, reservation = await _seed(db_session)

    await reservation_service.record_confirmation_delivery(
        db_session,
        business_id=business.id,
        reservation_id=reservation.id,
        channel="email",
        message_kind="created",
        delivered=True,
    )
    await reservation_service.record_confirmation_delivery(
        db_session,
        business_id=business.id,
        reservation_id=reservation.id,
        channel="email",
        message_kind="rescheduled",
        delivered=False,
    )

    attempts = (
        await db_session.scalars(
            select(ReservationDeliveryAttempt).where(
                ReservationDeliveryAttempt.reservation_id == reservation.id
            )
        )
    ).all()
    by_kind = {a.message_kind: a for a in attempts}
    assert set(by_kind) == {"created", "rescheduled"}
    assert by_kind["created"].status == "delivered"
    assert by_kind["rescheduled"].status == "failed"
