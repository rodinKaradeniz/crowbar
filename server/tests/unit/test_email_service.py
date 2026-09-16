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


def _capture_every_send(monkeypatch) -> list[dict]:
    """Capture the send params of every message the product can send.

    Six of them: the original five plus email verification. A new sender that
    is not added here is not covered by the text-part or compliance checks.
    """
    captured: list[dict] = []
    monkeypatch.setattr(email_service.settings, "resend_api_key", "test-key")
    monkeypatch.setattr(
        email_service.resend.Emails, "send", lambda params: captured.append(dict(params))
    )
    email_service.send_reservation_confirmation(
        to_email="guest@example.com",
        customer_name="Guest",
        business_name="Bar",
        service_type_name="Table",
        reservation_time=datetime(2026, 8, 1, 18, 0, tzinfo=timezone.utc),
        duration_minutes=90,
        guests=4,
        reservation_id="r-1",
        business_timezone="Europe/Berlin",
        calendar_sequence=0,
        management_url="https://app.test/reserve/manage#token=MANAGE",
    )
    email_service.send_waitlist_offer(
        to_email="guest@example.com",
        business_name="Bar",
        offer_url="https://app.test/reserve/waitlist#token=OFFER",
    )
    email_service.send_reservation_reminder(
        to_email="guest@example.com",
        business_name="Bar",
        management_url="https://app.test/reserve/manage#token=REMIND",
    )
    email_service.send_staff_invitation(
        to_email="staff@example.com",
        business_name="Bar",
        role="host_server",
        invite_url="https://app.test/invite#token=INVITE",
    )
    email_service.send_password_reset(
        to_email="staff@example.com",
        reset_url="https://app.test/auth/reset-password#token=RESET",
    )
    email_service.send_email_verification(
        to_email="staff@example.com",
        verify_url="https://app.test/auth/verify-email#token=VERIFY",
    )
    return captured


def test_every_email_carries_a_plain_text_part_with_its_links(monkeypatch):
    """HTML-only is a spam signal, and a link in an <a href> is invisible in
    a text client. Both parts, and every URL written out in full."""
    import re

    captured = _capture_every_send(monkeypatch)
    assert len(captured) == 6

    for params in captured:
        assert params.get("html"), params["subject"]
        assert params.get("text"), params["subject"]
        for url in set(re.findall(r'https://[^\s"<>]+', params["html"])):
            assert url in params["text"], f"{url} missing from {params['subject']}"


def test_no_email_claims_payment_or_revenue(monkeypatch):
    """The pilot is non-fiscal: the venue's own register is the payment and
    fiscal authority, and no Crowbar copy may imply otherwise."""
    for params in _capture_every_send(monkeypatch):
        body = (params["html"] + params["text"]).lower()
        for banned in ("paid", "payment processed", "revenue"):
            assert banned not in body, f"{banned!r} in {params['subject']}"


def test_a_rejected_send_is_logged_without_the_recipient_or_the_key(
    monkeypatch, caplog
):
    """A configured provider refusing a send is an incident an operator should
    see -- but a guest address is personal data and must not reach the log."""
    monkeypatch.setattr(email_service.settings, "resend_api_key", "re_SECRET_KEY")

    def reject(params):
        raise RuntimeError(
            "Resend refused guest@example.com using key re_SECRET_KEY"
        )

    monkeypatch.setattr(email_service.resend.Emails, "send", reject)

    with caplog.at_level("WARNING"):
        delivered = email_service.send_password_reset(
            to_email="guest@example.com", reset_url="https://app.test/x"
        )

    assert delivered is False
    record = caplog.records[-1]
    message = record.getMessage()
    assert record.levelname == "WARNING"
    assert "kind=password_reset" in message
    assert "error_type=RuntimeError" in message
    assert "guest@example.com" not in message
    assert "re_SECRET_KEY" not in message
    # A traceback would bypass SensitiveDataFilter, which only rewrites
    # record.msg -- so there must not be one.
    assert record.exc_info is None


def test_an_unconfigured_provider_is_not_an_incident(monkeypatch, caplog):
    """No provider is the normal pre-pilot state, so it stays at debug and the
    persisted string says so rather than blaming the provider."""
    monkeypatch.setattr(email_service.settings, "resend_api_key", None)

    with caplog.at_level("DEBUG"):
        delivered = email_service.send_password_reset(
            to_email="guest@example.com", reset_url="https://app.test/x"
        )

    assert delivered is False
    assert caplog.records[-1].levelname == "DEBUG"
    assert email_service.failure_reason() == email_service.NOT_CONFIGURED

    monkeypatch.setattr(email_service.settings, "resend_api_key", "re_key")
    assert email_service.failure_reason() == email_service.PROVIDER_REJECTED
