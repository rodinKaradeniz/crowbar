"""Consent that actually suppresses something.

Before stage 6, `CustomerMarketingConsent` was written by the public reservation
flow and then read by nothing except the guest profile screen. A guest who
withdrew consent kept receiving every message: the record existed, the
suppression did not.

The rule this file enforces, decided in stage 6:

* **Marketing** messages are suppressed for a guest who has withdrawn consent on
  that channel, and for a guest who never gave it.
* **Operational** messages are not. A booking confirmation, a reminder for a
  table the guest asked for, a "your table is ready" text, a waitlist offer they
  requested — these fulfil the guest's own request. Suppressing them would mean
  a guest who opts out of marketing silently stops being told their table is
  ready, which is worse for them, not better.

Every send site declares which it is. There is no default: an unclassified send
will not compile past the type checker, which is the point — the next person to
add an outbound message has to decide, rather than inheriting whichever answer
happened to be the fallback.

**No marketing sender ships in the MVP.** `docs/TODO.md` defers automated
marketing, loyalty and review campaigns. This gate exists so the first one
cannot be written without passing through it.
"""

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import CustomerMarketingConsent

#: What kind of message is being sent, and therefore which rule applies.
MessageClass = Literal["operational", "marketing"]

#: Channels a guest can be contacted on, and therefore consent to separately.
Channel = Literal["email", "sms"]

CONSENT_SOURCE_GUEST_WITHDRAWAL = "guest_withdrawal"


async def is_suppressed(
    db: AsyncSession,
    *,
    business_id: UUID,
    customer_id: UUID | None,
    channel: Channel,
    message_class: MessageClass,
) -> bool:
    """Whether this message must not be sent.

    Operational messages are never suppressed here — the guest asked for the
    thing the message is about.

    Marketing is opt-in: no consent record means no consent. A record with
    `is_consented` false, or with `withdrawn_at` set, is a withdrawal. A send to
    a guest with no customer record at all is also suppressed, because there is
    nowhere for their consent to live and no way to honour a later withdrawal.
    """
    if message_class == "operational":
        return False
    if customer_id is None:
        return True

    consent = await db.scalar(
        select(CustomerMarketingConsent).where(
            CustomerMarketingConsent.business_id == business_id,
            CustomerMarketingConsent.customer_id == customer_id,
            CustomerMarketingConsent.channel == channel,
        )
    )
    if consent is None:
        return True
    return not consent.is_consented or consent.withdrawn_at is not None


async def withdraw_all(
    db: AsyncSession, *, business_id: UUID, customer_id: UUID
) -> list[str]:
    """Withdraw marketing consent on every channel for one guest.

    Records rather than deletes: a deleted consent row cannot prove the venue
    honoured a withdrawal, and `withdrawn_at` is the evidence. Returns the
    channels that changed, so a caller can tell "withdrawn" from "already
    withdrawn" without a second query.

    Idempotent — a guest clicking twice is a guest, not an error.
    """
    now = datetime.now(timezone.utc)
    consents = (
        await db.scalars(
            select(CustomerMarketingConsent).where(
                CustomerMarketingConsent.business_id == business_id,
                CustomerMarketingConsent.customer_id == customer_id,
            )
        )
    ).all()

    withdrawn: list[str] = []
    for consent in consents:
        if consent.is_consented or consent.withdrawn_at is None:
            consent.is_consented = False
            consent.withdrawn_at = now
            withdrawn.append(consent.channel)

    # A guest with no consent record has nothing to withdraw, and creating a
    # withdrawal row for a consent that was never given would invent a fact.
    return sorted(set(withdrawn))


async def consent_state(
    db: AsyncSession, *, business_id: UUID, customer_id: UUID
) -> dict[str, bool]:
    """Per-channel consent, for showing a guest what the venue currently holds."""
    consents = (
        await db.scalars(
            select(CustomerMarketingConsent).where(
                CustomerMarketingConsent.business_id == business_id,
                CustomerMarketingConsent.customer_id == customer_id,
            )
        )
    ).all()
    return {
        consent.channel: bool(consent.is_consented and consent.withdrawn_at is None)
        for consent in consents
    }
