from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.jobs.reservation_reminders import run_reservation_reminders
from app.models.booking_schedule import BookingSchedule
from app.models.business import Business
from app.models.customer import Customer
from app.models.reservation import Reservation
from app.models.reservation_delivery_attempt import ReservationDeliveryAttempt
from app.models.service_type import ServiceType


@pytest.mark.asyncio
async def test_reminders_retry_only_failed_channel_and_use_venue_timezone(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    run_at = datetime(2026, 8, 14, 18, 0, tzinfo=timezone.utc)
    business = Business(
        name="Berlin Bar",
        slug="berlin-reminder",
        email="bar@example.com",
        phone="+4930123456",
        timezone="Europe/Berlin",
        enabled_modules=["reservations"],
        notification_channels=["email", "sms"],
    )
    db_session.add(business)
    await db_session.flush()
    service = ServiceType(
        business_id=business.id,
        name="Table",
        capacity=4,
        duration=60,
    )
    customer = Customer(
        business_id=business.id,
        name="Guest",
        phone="+4915111111111",
        email="guest@example.com",
    )
    db_session.add_all([service, customer])
    await db_session.flush()
    db_session.add(
        BookingSchedule(
            business_id=business.id,
            reminder_enabled=True,
            reminder_lead_minutes=1440,
        )
    )
    reservation = Reservation(
        business_id=business.id,
        customer_id=customer.id,
        service_type_id=service.id,
        time=run_at + timedelta(days=1),
        ends_at=run_at + timedelta(days=1, hours=1),
        phone=customer.phone,
        email=customer.email,
        status="confirmed",
        guests=2,
    )
    db_session.add(reservation)
    await db_session.flush()
    reservation_id = reservation.id
    await db_session.commit()

    test_url = db_session.bind.url.render_as_string(hide_password=False)
    monkeypatch.setattr(settings, "database_url", test_url)
    email_results = iter([False, True])
    email_calls: list[str] = []
    sms_bodies: list[str] = []

    def send_email(**kwargs) -> bool:
        email_calls.append(kwargs["to_email"])
        return next(email_results)

    def send_sms(_phone: str, body: str) -> bool:
        sms_bodies.append(body)
        return True

    monkeypatch.setattr(
        "app.jobs.reservation_reminders.email_service.send_reservation_reminder",
        send_email,
    )
    monkeypatch.setattr(
        "app.jobs.reservation_reminders.sms_service.send_sms", send_sms
    )

    first = await run_reservation_reminders(now=run_at)
    second = await run_reservation_reminders(now=run_at + timedelta(minutes=5))

    assert first.sent == 1
    assert second.sent == 1
    assert email_calls == ["guest@example.com", "guest@example.com"]
    assert len(sms_bodies) == 1
    assert "08:00 PM CEST" in sms_bodies[0]

    db_session.expire_all()
    attempts = list(
        (
            await db_session.scalars(
                select(ReservationDeliveryAttempt).where(
                    ReservationDeliveryAttempt.reservation_id == reservation_id
                )
            )
        ).all()
    )
    by_channel = {attempt.channel: attempt for attempt in attempts}
    assert by_channel["email"].status == "delivered"
    assert by_channel["email"].attempt_count == 2
    assert by_channel["sms"].status == "delivered"
    assert by_channel["sms"].attempt_count == 1
