"""Email service using Resend for reservation confirmations and notifications."""

import base64
from datetime import datetime
from zoneinfo import ZoneInfo

import icalendar
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


def _build_ics_attachment(
    *,
    summary: str,
    description: str,
    start: datetime,
    end: datetime,
    location: str | None = None,
    organizer_email: str | None = None,
    attendee_email: str,
) -> bytes:
    """Build an ICS calendar invite for the reservation."""
    cal = icalendar.Calendar()
    cal.add("prodid", "-//Slotera//Calendar//EN")
    cal.add("version", "2.0")
    cal.add("method", "REQUEST")  # Request = invite

    event = icalendar.Event()
    event.add("summary", summary)
    event.add("description", description)
    event.add("dtstart", start)
    event.add("dtend", end)
    if location:
        event.add("location", location)
    if organizer_email:
        event.add("organizer", f"mailto:{organizer_email}")
    event.add("attendee", f"mailto:{attendee_email}")
    event.add("uid", f"reservation-{start.timestamp()}@slotera")

    cal.add_component(event)
    return cal.to_ical()


def send_reservation_confirmation(
    *,
    to_email: str,
    customer_name: str,
    business_name: str,
    service_type_name: str,
    reservation_time: datetime,
    duration_minutes: int | None,
    guests: int,
    meeting_link: str | None = None,
    status: str = "confirmed",
    business_email: str | None = None,
) -> bool:
    """
    Send reservation confirmation email to the customer.

    For online reservations with meeting_link, includes the link and an ICS attachment.
    """
    if not _ensure_resend_configured():
        return False

    resend.api_key = settings.resend_api_key

    time_str = _format_datetime(reservation_time)
    is_online = bool(meeting_link)

    if status == "pending":
        subject = f"Reservation received – {business_name}"
        status_line = "Your reservation has been received and is awaiting confirmation."
    else:
        subject = f"Reservation confirmed – {business_name}"
        status_line = "Your reservation has been confirmed."

    html_parts = [
        f"<p>Hi {customer_name},</p>",
        f"<p>{status_line}</p>",
        "<p><strong>Reservation details:</strong></p>",
        "<ul>",
        f"<li><strong>Business:</strong> {business_name}</li>",
        f"<li><strong>Service:</strong> {service_type_name}</li>",
        f"<li><strong>Date & time:</strong> {time_str}</li>",
        f"<li><strong>Guests:</strong> {guests}</li>",
        "</ul>",
    ]

    if is_online and meeting_link:
        html_parts.extend([
            "<p><strong>This is an online meeting.</strong></p>",
            f'<p><a href="{meeting_link}" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Join Google Meet</a></p>',
            f"<p>Or copy this link: {meeting_link}</p>",
        ])

    html_parts.append("<p>We look forward to seeing you!</p>")
    html = "\n".join(html_parts)

    attachments = []
    if is_online and meeting_link and duration_minutes:
        from datetime import timedelta

        start_dt = reservation_time
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=ZoneInfo("UTC"))
        end_time = start_dt + timedelta(minutes=duration_minutes)
        ics_content = _build_ics_attachment(
            summary=f"{service_type_name} – {business_name}",
            description=f"Reservation at {business_name}. Meeting link: {meeting_link}",
            start=start_dt,
            end=end_time,
            location=meeting_link,
            organizer_email=business_email,
            attendee_email=to_email,
        )
        attachments.append({
            "content": base64.b64encode(ics_content).decode("ascii"),
            "filename": "invite.ics",
            "content_type": "text/calendar",
        })

    params: resend.Emails.SendParams = {
        "from": f"{settings.email_from_name} <{settings.email_from_address}>",
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    if attachments:
        params["attachments"] = attachments

    try:
        resend.Emails.send(params)
        return True
    except Exception:
        return False


def send_payment_receipt(
    *,
    to_email: str,
    customer_name: str,
    business_name: str,
    service_type_name: str,
    reservation_time: datetime,
    amount_paid: float,
    reservation_id: str,
) -> bool:
    """
    Send payment receipt email when a reservation payment is completed.
    """
    if not _ensure_resend_configured():
        return False

    resend.api_key = settings.resend_api_key

    time_str = _format_datetime(reservation_time)
    amount_str = f"${amount_paid:,.2f}"

    html_parts = [
        f"<p>Hi {customer_name},</p>",
        "<p>Thank you for your payment. This email confirms your transaction.</p>",
        "<p><strong>Payment receipt</strong></p>",
        "<ul>",
        f"<li><strong>Business:</strong> {business_name}</li>",
        f"<li><strong>Service:</strong> {service_type_name}</li>",
        f"<li><strong>Date & time:</strong> {time_str}</li>",
        f"<li><strong>Amount paid:</strong> {amount_str}</li>",
        f"<li><strong>Reservation ID:</strong> {reservation_id}</li>",
        "</ul>",
        "<p>Thank you for your business!</p>",
    ]

    html = "\n".join(html_parts)

    params: resend.Emails.SendParams = {
        "from": f"{settings.email_from_name} <{settings.email_from_address}>",
        "to": [to_email],
        "subject": f"Payment receipt – {business_name}",
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
    meeting_link: str | None = None,
    business_email: str | None = None,
) -> bool:
    """
    Send email when a pending reservation is confirmed by the business.
    Same as confirmation but always with "confirmed" status.
    """
    return send_reservation_confirmation(
        to_email=to_email,
        customer_name=customer_name,
        business_name=business_name,
        service_type_name=service_type_name,
        reservation_time=reservation_time,
        duration_minutes=duration_minutes,
        guests=guests,
        meeting_link=meeting_link,
        status="confirmed",
        business_email=business_email,
    )
