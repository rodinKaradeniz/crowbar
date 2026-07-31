"""Email service using Resend for reservation confirmations and notifications."""

import base64
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import resend

from app.config import settings


def _ensure_resend_configured() -> bool:
    """Return True if Resend is configured and ready to send."""
    return bool(settings.resend_api_key)


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
        f"<p>Hi {customer_name},</p>",
        f"<p>{status_line}</p>",
        "<p><strong>Reservation details:</strong></p>",
        "<ul>",
        f"<li><strong>Business:</strong> {business_name}</li>",
        f"<li><strong>Service:</strong> {service_type_name}</li>",
        f"<li><strong>Date & time:</strong> {time_str}</li>",
        f"<li><strong>Guests:</strong> {guests}</li>",
        "</ul>",
        (
            f'<p><a href="{management_url}">Manage this reservation</a></p>'
            if management_url
            else ""
        ),
        "<p>We look forward to seeing you!</p>",
    ])

    params: resend.Emails.SendParams = {
        "from": f"{settings.email_from_name} <{settings.email_from_address}>",
        "to": [to_email],
        "subject": subject,
        "html": html,
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
    except Exception:
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
                f"<p>{business_name} has a table available for you.</p>",
                f'<p><a href="{offer_url}">Accept this offer</a></p>',
                "<p>This offer expires in 15 minutes.</p>",
            ]),
        })
        return True
    except Exception:
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
                f"<p>This is a reminder about your reservation at {business_name}.</p>",
                f'<p><a href="{management_url}">Manage or reconfirm your reservation</a></p>',
            ]),
        })
        return True
    except Exception:
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
        f"<p>You've been invited to join <strong>{business_name}</strong> on Crowbar as a <strong>{role_display}</strong>.</p>",
        "<p>Click the link below to accept your invitation and set up your account:</p>",
        f'<p><a href="{invite_url}" style="background:#111;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Accept Invitation</a></p>',
        "<p>This invitation expires in 7 days. If you did not expect this invitation, you can safely ignore this email.</p>",
    ])

    params: resend.Emails.SendParams = {
        "from": f"{settings.email_from_name} <{settings.email_from_address}>",
        "to": [to_email],
        "subject": f"You've been invited to join {business_name} on Crowbar",
        "html": html,
    }

    try:
        resend.Emails.send(params)
        return True
    except Exception:
        return False
