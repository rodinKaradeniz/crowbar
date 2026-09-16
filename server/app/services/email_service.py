"""Email service using Resend for reservation confirmations and notifications."""

import base64
import logging
from html import escape
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import resend

from app.config import settings
from app.core.log_redaction import destination_reference, redact_log_text

logger = logging.getLogger(__name__)

#: The two ways an email does not get sent. They are different incidents and an
#: operator reads them differently: the first is a venue that was never set up,
#: the second is a provider actively refusing traffic. Collapsing them into one
#: string is what made the 2026-09-10 investigation start from zero.
NOT_CONFIGURED = "Email is not configured for this venue"
PROVIDER_REJECTED = "The email provider rejected this message"


def is_configured() -> bool:
    """Whether a provider is configured at all, asked without attempting a send.

    Callers use this to choose between the two failure strings above. It is
    deliberately silent — `_ensure_resend_configured` owns the logging.
    """
    return bool(settings.resend_api_key)


def failure_reason() -> str:
    """The reason a send just failed, for a string an operator will read."""
    return PROVIDER_REJECTED if is_configured() else NOT_CONFIGURED


def _ensure_resend_configured() -> bool:
    """Return True if Resend is configured and ready to send.

    A venue with no provider configured is the normal local and pre-pilot
    state, not an incident — so this is debug, matching how sms_service reports
    the same condition. It exists because this module used to have no logger at
    all: every unsent email, including a guest's reservation confirmation, left
    no trace anywhere. Every caller now persists a DeliveryAttempt and surfaces
    the failure to an operator, the reservation confirmation included, so a
    `False` from here is recorded rather than lost.
    """
    if not settings.resend_api_key:
        logger.debug("Resend is not configured — email skipped")
        return False
    return True


def _log_send_failure(kind: str, to_email: str, exc: Exception) -> None:
    """Record a provider rejection at a level an operator actually sees.

    A CONFIGURED provider refusing a send is an incident, unlike the
    unconfigured case above, so this is warning rather than debug.

    THE RECIPIENT ADDRESS IS NEVER LOGGED. Guest email addresses are personal
    data and this is a German pilot. `destination_ref` is a keyed HMAC, so two
    lines about the same recipient still correlate without naming anyone.

    `logger.exception` is deliberately NOT used here, and the reason is not
    style: `core.log_redaction.SensitiveDataFilter` rewrites `record.msg` and
    nothing else, so a traceback bypasses redaction entirely. Resend echoes the
    recipient back in some error bodies, which would put an unredacted guest
    address in the log. The exception type plus a scrubbed message says what
    went wrong — a bad key, a rate limit, a rejected address are all distinct
    here — without that risk.
    """
    detail = redact_log_text(str(exc))
    # The shared patterns catch `key=value` shapes, not a bare credential sitting
    # in a sentence. The configured key is the one secret we can match exactly,
    # so match it exactly rather than guessing at a provider key format.
    if settings.resend_api_key:
        detail = detail.replace(settings.resend_api_key, "[redacted-api-key]")
    logger.warning(
        "email send failed kind=%s destination_ref=%s error_type=%s detail=%s",
        kind,
        destination_reference(to_email),
        type(exc).__name__,
        detail,
    )


def _format_datetime(dt: datetime, timezone_name: str) -> str:
    """Format datetime for display in emails."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(ZoneInfo(timezone_name))
    return dt.strftime("%A, %B %d, %Y at %I:%M %p %Z")


def _ics_escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _calendar_attachment(
    *,
    reservation_id: str,
    business_name: str,
    service_type_name: str,
    reservation_time: datetime,
    duration_minutes: int,
    status: str,
    sequence: int,
) -> dict[str, str]:
    start = reservation_time
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    start = start.astimezone(timezone.utc)
    end = start + timedelta(minutes=max(duration_minutes, 1))
    stamp = datetime.now(timezone.utc)
    calendar_status = "TENTATIVE" if status == "pending" else "CONFIRMED"
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Crowbar//Reservations//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{reservation_id}@crowbar",
        f"DTSTAMP:{stamp.strftime('%Y%m%dT%H%M%SZ')}",
        f"DTSTART:{start.strftime('%Y%m%dT%H%M%SZ')}",
        f"DTEND:{end.strftime('%Y%m%dT%H%M%SZ')}",
        f"SEQUENCE:{max(sequence, 0)}",
        f"STATUS:{calendar_status}",
        f"SUMMARY:{_ics_escape(service_type_name)} at {_ics_escape(business_name)}",
        f"DESCRIPTION:{_ics_escape(f'Reservation at {business_name}')}",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ]
    content = base64.b64encode("\r\n".join(lines).encode("utf-8")).decode("ascii")
    return {
        "content": content,
        "filename": f"crowbar-reservation-{reservation_id}.ics",
    }


def send_reservation_confirmation(
    *,
    to_email: str,
    customer_name: str,
    business_name: str,
    service_type_name: str,
    reservation_time: datetime,
    duration_minutes: int | None,
    guests: int,
    reservation_id: str,
    business_timezone: str,
    calendar_sequence: int,
    management_url: str | None = None,
    status: str = "confirmed",
    message_kind: str = "created",
) -> bool:
    """Send reservation confirmation email to the customer."""
    if not _ensure_resend_configured():
        return False

    resend.api_key = settings.resend_api_key

    time_str = _format_datetime(reservation_time, business_timezone)

    if message_kind == "rescheduled":
        subject = f"Reservation rescheduled – {business_name}"
        status_line = (
            "Your reservation has been rescheduled and is awaiting confirmation."
            if status == "pending"
            else "Your reservation has been rescheduled."
        )
    elif status == "pending":
        subject = f"Reservation received – {business_name}"
        status_line = "Your reservation has been received and is awaiting confirmation."
    else:
        subject = f"Reservation confirmed – {business_name}"
        status_line = "Your reservation has been confirmed."

    html = "\n".join([
        f"<p>Hi {escape(customer_name)},</p>",
        f"<p>{escape(status_line)}</p>",
        "<p><strong>Reservation details:</strong></p>",
        "<ul>",
        f"<li><strong>Business:</strong> {escape(business_name)}</li>",
        f"<li><strong>Service:</strong> {escape(service_type_name)}</li>",
        f"<li><strong>Date & time:</strong> {escape(time_str)}</li>",
        f"<li><strong>Guests:</strong> {guests}</li>",
        "</ul>",
        (
            f'<p><a href="{escape(management_url, quote=True)}">Manage this reservation</a></p>'
            if management_url
            else ""
        ),
        "<p>We look forward to seeing you!</p>",
    ])

    # The same content, not a summary of it. Raw values, not escaped ones —
    # HTML escaping in a text/plain body is a bug, not a safety measure. The
    # management URL is written out in full because a link that exists only as
    # an <a href> is invisible to anyone reading the text part.
    text = "\n".join(
        [
            f"Hi {customer_name},",
            "",
            status_line,
            "",
            "Reservation details:",
            f"  Business: {business_name}",
            f"  Service: {service_type_name}",
            f"  Date & time: {time_str}",
            f"  Guests: {guests}",
        ]
        + (["", f"Manage this reservation: {management_url}"] if management_url else [])
        + ["", "We look forward to seeing you!"]
    )

    params: resend.Emails.SendParams = {
        "from": f"{settings.email_from_name} <{settings.email_from_address}>",
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": text,
        "attachments": [
            _calendar_attachment(
                reservation_id=reservation_id,
                business_name=business_name,
                service_type_name=service_type_name,
                reservation_time=reservation_time,
                duration_minutes=duration_minutes or 60,
                status=status,
                sequence=calendar_sequence,
            )
        ],
    }

    try:
        resend.Emails.send(params)
        return True
    except Exception as exc:
        _log_send_failure(message_kind, to_email, exc)
        return False


def send_waitlist_offer(*, to_email: str, business_name: str, offer_url: str) -> bool:
    if not _ensure_resend_configured():
        return False
    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send({
            "from": f"{settings.email_from_name} <{settings.email_from_address}>",
            "to": [to_email],
            "subject": f"A table is available – {business_name}",
            "html": "\n".join([
                f"<p>{escape(business_name)} has a table available for you.</p>",
                f'<p><a href="{escape(offer_url, quote=True)}">Accept this offer</a></p>',
                "<p>This offer expires in 15 minutes.</p>",
            ]),
            "text": "\n".join([
                f"{business_name} has a table available for you.",
                "",
                f"Accept this offer: {offer_url}",
                "",
                "This offer expires in 15 minutes.",
            ]),
        })
        return True
    except Exception as exc:
        _log_send_failure("waitlist_offer", to_email, exc)
        return False


def send_reservation_reminder(*, to_email: str, business_name: str, management_url: str) -> bool:
    if not _ensure_resend_configured():
        return False
    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send({
            "from": f"{settings.email_from_name} <{settings.email_from_address}>",
            "to": [to_email],
            "subject": f"Reservation reminder – {business_name}",
            "html": "\n".join([
                f"<p>This is a reminder about your reservation at {escape(business_name)}.</p>",
                f'<p><a href="{escape(management_url, quote=True)}">Manage or reconfirm your reservation</a></p>',
            ]),
            "text": "\n".join([
                f"This is a reminder about your reservation at {business_name}.",
                "",
                f"Manage or reconfirm your reservation: {management_url}",
            ]),
        })
        return True
    except Exception as exc:
        _log_send_failure("reminder", to_email, exc)
        return False


def send_staff_invitation(
    *,
    to_email: str,
    business_name: str,
    role: str,
    invite_url: str,
) -> bool:
    """Send a staff invitation email with a one-time accept link."""
    if not _ensure_resend_configured():
        return False

    resend.api_key = settings.resend_api_key

    role_display = role.replace("_", " ").title()

    html = "\n".join([
        f"<p>You've been invited to join <strong>{escape(business_name)}</strong> on Crowbar as a <strong>{escape(role_display)}</strong>.</p>",
        "<p>Click the link below to accept your invitation and set up your account:</p>",
        f'<p><a href="{escape(invite_url, quote=True)}" style="background:#111;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Accept Invitation</a></p>',
        "<p>This invitation expires in 7 days. If you did not expect this invitation, you can safely ignore this email.</p>",
    ])

    text = "\n".join([
        f"You've been invited to join {business_name} on Crowbar as a {role_display}.",
        "",
        "Open the link below to accept your invitation and set up your account:",
        invite_url,
        "",
        "This invitation expires in 7 days. If you did not expect this "
        "invitation, you can safely ignore this email.",
    ])

    params: resend.Emails.SendParams = {
        "from": f"{settings.email_from_name} <{settings.email_from_address}>",
        "to": [to_email],
        "subject": f"You've been invited to join {business_name} on Crowbar",
        "html": html,
        "text": text,
    }

    try:
        resend.Emails.send(params)
        return True
    except Exception as exc:
        _log_send_failure("staff_invitation", to_email, exc)
        return False


def send_password_reset(*, to_email: str, reset_url: str) -> bool:
    if not _ensure_resend_configured():
        return False
    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send({
            "from": f"{settings.email_from_name} <{settings.email_from_address}>",
            "to": [to_email],
            "subject": "Reset your Crowbar password",
            "html": "\n".join([
                "<p>A password reset was requested for your Crowbar staff account.</p>",
                f'<p><a href="{escape(reset_url, quote=True)}">Reset password</a></p>',
                "<p>This single-use link expires in 30 minutes. If you did not request it, you can ignore this email.</p>",
            ]),
            "text": "\n".join([
                "A password reset was requested for your Crowbar staff account.",
                "",
                f"Reset password: {reset_url}",
                "",
                "This single-use link expires in 30 minutes. If you did not "
                "request it, you can ignore this email.",
            ]),
        })
        return True
    except Exception as exc:
        _log_send_failure("password_reset", to_email, exc)
        return False


def send_email_verification(
    *, to_email: str, verify_url: str, is_change: bool = False
) -> bool:
    """Ask the holder of `to_email` to prove they can read mail there.

    `is_change` selects the copy for a REQUESTED address change, where the
    account has not moved yet and says so, from the copy for confirming the
    address an account was opened with.
    """
    if not _ensure_resend_configured():
        return False
    resend.api_key = settings.resend_api_key

    if is_change:
        subject = "Confirm your new Crowbar email address"
        opening = (
            "You asked to change the email address on your Crowbar staff "
            "account to this one."
        )
        closing = (
            "Your account keeps its current address until you confirm here. "
            "This single-use link expires in 24 hours. If you did not ask for "
            "this, you can ignore this email — nothing has changed."
        )
    else:
        subject = "Confirm your Crowbar email address"
        opening = (
            "Confirm this address so it can be used to recover your Crowbar "
            "staff account."
        )
        closing = (
            "This single-use link expires in 24 hours. If you did not create a "
            "Crowbar account, you can ignore this email."
        )

    params: resend.Emails.SendParams = {
        "from": f"{settings.email_from_name} <{settings.email_from_address}>",
        "to": [to_email],
        "subject": subject,
        "html": "\n".join([
            f"<p>{escape(opening)}</p>",
            f'<p><a href="{escape(verify_url, quote=True)}">Confirm this address</a></p>',
            f"<p>{escape(closing)}</p>",
        ]),
        "text": "\n".join([
            opening,
            "",
            f"Confirm this address: {verify_url}",
            "",
            closing,
        ]),
    }

    try:
        resend.Emails.send(params)
        return True
    except Exception as exc:
        _log_send_failure(
            "email_verification_change" if is_change else "email_verification",
            to_email,
            exc,
        )
        return False
