"""Email service using Resend for reservation confirmations and notifications."""

from datetime import datetime
from zoneinfo import ZoneInfo

import resend

from app.config import settings


def _ensure_resend_configured() -> bool:
    """Return True if Resend is configured and ready to send."""
    return bool(settings.resend_api_key)


def _format_datetime(dt: datetime) -> str:
    """Format datetime for display in emails."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.strftime("%A, %B %d, %Y at %I:%M %p %Z")


def send_reservation_confirmation(
    *,
    to_email: str,
    customer_name: str,
    business_name: str,
    service_type_name: str,
    reservation_time: datetime,
    duration_minutes: int | None,
    guests: int,
    status: str = "confirmed",
    business_email: str | None = None,
) -> bool:
    """Send reservation confirmation email to the customer."""
    if not _ensure_resend_configured():
        return False

    resend.api_key = settings.resend_api_key

    time_str = _format_datetime(reservation_time)

    if status == "pending":
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
        "<p>We look forward to seeing you!</p>",
    ])

    params: resend.Emails.SendParams = {
        "from": f"{settings.email_from_name} <{settings.email_from_address}>",
        "to": [to_email],
        "subject": subject,
        "html": html,
    }

    try:
        resend.Emails.send(params)
        return True
    except Exception:
        return False


def send_reservation_confirmed(
    *,
    to_email: str,
    customer_name: str,
    business_name: str,
    service_type_name: str,
    reservation_time: datetime,
    duration_minutes: int | None,
    guests: int,
    business_email: str | None = None,
) -> bool:
    """Send email when a pending reservation is confirmed by the business."""
    return send_reservation_confirmation(
        to_email=to_email,
        customer_name=customer_name,
        business_name=business_name,
        service_type_name=service_type_name,
        reservation_time=reservation_time,
        duration_minutes=duration_minutes,
        guests=guests,
        status="confirmed",
        business_email=business_email,
    )


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
