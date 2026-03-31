"""
Twilio SMS service.

Provides a single `send_sms` function that is a graceful no-op when Twilio
credentials are not configured, or when the phone number is not in E.164 format.
Never raises exceptions — always returns bool.
"""

import logging

from app.config import settings

logger = logging.getLogger(__name__)


def send_sms(to_number: str, body: str) -> bool:
    """
    Send an SMS via Twilio.

    Returns True on success, False on any failure (missing config, bad number,
    Twilio error).

    Phone numbers must be in E.164 format (e.g. +14155551234). Numbers that
    do not start with '+' are silently rejected — see backlog.md for
    normalization tracking.
    """
    if not settings.twilio_account_sid or not settings.twilio_auth_token or not settings.twilio_from_number:
        logger.debug("Twilio not configured — SMS skipped")
        return False

    if not to_number or not to_number.startswith("+"):
        logger.debug("SMS skipped: phone number %r is not E.164 format", to_number)
        return False

    try:
        from twilio.rest import Client  # noqa: PLC0415 — lazy import

        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        message = client.messages.create(
            body=body,
            from_=settings.twilio_from_number,
            to=to_number,
        )
        logger.info("SMS sent to %s: sid=%s", to_number, message.sid)
        return True
    except Exception as e:
        logger.warning("SMS send failed to %s: %s", to_number, e)
        return False
