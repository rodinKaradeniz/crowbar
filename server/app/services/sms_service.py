"""
Twilio SMS service.

Provides a single `send_sms` function that is a graceful no-op when Twilio
credentials are not configured, or when the phone number is not in E.164 format.
Never raises exceptions — always returns bool.
"""

import logging
import hashlib
import hmac
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.marketing_consent_service import (
    MessageClass,
    is_suppressed,
)

logger = logging.getLogger(__name__)


def _destination_reference(to_number: str) -> str:
    return hmac.new(
        settings.rate_limit_hmac_secret.encode("utf-8"),
        to_number.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:12]


def send_sms(
    to_number: str, body: str, *, message_class: MessageClass = "operational"
) -> bool:
    """
    Send an operational SMS via Twilio.

    Returns True on success, False on any failure (missing config, bad number,
    Twilio error).

    Phone numbers must be in E.164 format (e.g. +14155551234). Numbers that
    do not start with '+' are silently rejected; callers normalize through the
    tenant's ISO country before reaching this function.

    **This function will not send marketing.** It is synchronous and has no
    database session, so it cannot check whether the guest withdrew consent, and
    a sender that cannot check consent must not be the one to decide. A
    marketing send has to go through `send_marketing_sms`, which does the check.
    Passing `message_class="marketing"` here raises rather than sending.
    """
    if message_class == "marketing":
        raise ValueError(
            "Marketing SMS must go through send_marketing_sms, which checks "
            "whether the guest withdrew consent."
        )
    if not settings.twilio_account_sid or not settings.twilio_auth_token or not settings.twilio_from_number:
        logger.debug("Twilio not configured — SMS skipped")
        return False

    if not to_number or not to_number.startswith("+"):
        logger.debug("SMS skipped: destination format is invalid")
        return False

    try:
        from twilio.rest import Client  # noqa: PLC0415 — lazy import

        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        message = client.messages.create(
            body=body,
            from_=settings.twilio_from_number,
            to=to_number,
        )
        logger.info("SMS sent destination_ref=%s", _destination_reference(to_number))
        return True
    except Exception as exc:
        logger.warning(
            "SMS send failed destination_ref=%s error_type=%s",
            _destination_reference(to_number),
            type(exc).__name__,
        )
        return False


async def send_marketing_sms(
    db: "AsyncSession",
    *,
    business_id: UUID,
    customer_id: UUID | None,
    to_number: str,
    body: str,
) -> bool:
    """Send a marketing SMS, but only to a guest who consented to it.

    Marketing is opt-in: a guest with no consent record, or one who withdrew,
    is not contacted. Returns False when suppressed, which is not a failure —
    the venue's obligation was met by not sending.

    Nothing calls this yet. `docs/TODO.md` defers automated marketing, loyalty
    and review campaigns past the MVP; this exists so the first campaign cannot
    be written without the consent check, rather than as a feature.
    """
    if await is_suppressed(
        db,
        business_id=business_id,
        customer_id=customer_id,
        channel="sms",
        message_class="marketing",
    ):
        logger.info(
            "Marketing SMS suppressed destination_ref=%s",
            _destination_reference(to_number),
        )
        return False
    return send_sms(to_number, body, message_class="operational")
