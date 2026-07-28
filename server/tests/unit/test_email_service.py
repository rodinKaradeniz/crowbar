import base64
from datetime import datetime, timezone

from app.services import email_service


def test_reservation_email_attaches_a_stable_ics_update(monkeypatch):
    sent: dict = {}

    monkeypatch.setattr(email_service.settings, "resend_api_key", "test-key")
    monkeypatch.setattr(
        email_service.resend.Emails,
        "send",
        lambda params: sent.update(params),
    )

    delivered = email_service.send_reservation_confirmation(
        to_email="guest@example.com",
        customer_name="Guest",
        business_name="Crowbar Test Bar",
        service_type_name="Table",
        reservation_time=datetime(2026, 8, 1, 18, 0, tzinfo=timezone.utc),
        duration_minutes=90,
        guests=4,
        reservation_id="reservation-123",
        business_timezone="Europe/Istanbul",
        calendar_sequence=42,
        status="confirmed",
        message_kind="rescheduled",
    )

    assert delivered is True
    assert sent["subject"] == "Reservation rescheduled – Crowbar Test Bar"
    attachment = sent["attachments"][0]
    calendar = base64.b64decode(attachment["content"]).decode("utf-8")
    assert attachment["filename"] == "crowbar-reservation-reservation-123.ics"
    assert "UID:reservation-123@crowbar" in calendar
    assert "DTSTART:20260801T180000Z" in calendar
    assert "DTEND:20260801T193000Z" in calendar
    assert "SEQUENCE:42" in calendar
    assert "STATUS:CONFIRMED" in calendar
