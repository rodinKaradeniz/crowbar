"""Send the hourly reservation-reminder batch, then exit.

Production runs this module as a Railway Cron job:

    python -m app.jobs.reservation_reminders
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.business import Business
from app.models.reservation import Reservation
from app.models.reservation_delivery_attempt import ReservationDeliveryAttempt
from app.models.booking_schedule import BookingSchedule
from app.services.reservation_guest_token_service import issue_guest_token
from app.services import email_service, sms_service

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReminderRun:
    sent: int
    skipped: int


async def run_reservation_reminders(
    *, now: datetime | None = None
) -> ReminderRun:
    """Send unsent reminders using each booking type's effective policy."""
    run_at = now or datetime.now(timezone.utc)
    if run_at.tzinfo is None:
        raise ValueError("now must be timezone-aware")

    window_start = run_at + timedelta(minutes=1)
    window_end = run_at + timedelta(hours=48)

    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    sent = 0
    skipped = 0

    try:
        async with session_factory() as db:
            result = await db.execute(
                select(Reservation, Business, BookingSchedule)
                .join(Business, Business.id == Reservation.business_id)
                .outerjoin(
                    BookingSchedule,
                    (BookingSchedule.business_id == Reservation.business_id)
                    & (BookingSchedule.service_type_id == Reservation.service_type_id),
                )
                .where(
                    Reservation.status == "confirmed",
                    Reservation.time >= window_start,
                    Reservation.time <= window_end,
                )
                .order_by(Reservation.time, Reservation.id)
                .with_for_update(of=Reservation, skip_locked=True)
            )

            for reservation, business, override_policy in result.all():
                policy = override_policy
                if policy is None:
                    policy = await db.scalar(
                        select(BookingSchedule).where(
                            BookingSchedule.business_id == reservation.business_id,
                            BookingSchedule.service_type_id.is_(None),
                        )
                    )
                if policy is None or not policy.reminder_enabled:
                    skipped += 1
                    continue
                lead = timedelta(minutes=policy.reminder_lead_minutes)
                if not run_at + lead - timedelta(hours=1) <= reservation.time <= run_at + lead + timedelta(hours=1):
                    skipped += 1
                    continue
                channels = business.notification_channels or []

                reservation_time = reservation.time.astimezone(
                    ZoneInfo(business.timezone or "UTC")
                ).strftime("%A, %B %d at %I:%M %p %Z")
                token = issue_guest_token(
                    business_id=reservation.business_id,
                    reservation_id=reservation.id,
                    revision=reservation.guest_token_revision,
                )
                body = (
                    f"Reminder from {business.name}: you have a reservation "
                    f"at {reservation_time}. Manage it: {settings.frontend_url}/reserve/manage/{token} "
                    "Reply STOP to opt out."
                )

                management_url = f"{settings.frontend_url}/reserve/manage/{token}"
                configured_channels = [
                    channel for channel in ("email", "sms") if channel in channels
                ]
                attempts_result = await db.execute(
                    select(ReservationDeliveryAttempt).where(
                        ReservationDeliveryAttempt.reservation_id == reservation.id,
                        ReservationDeliveryAttempt.message_kind == "reminder",
                    )
                )
                attempts = {
                    attempt.channel: attempt
                    for attempt in attempts_result.scalars().all()
                }

                delivered_any = False
                for channel in configured_channels:
                    attempt = attempts.get(channel)
                    if attempt is not None and attempt.status == "delivered":
                        delivered_any = True
                        continue
                    if attempt is None:
                        attempt = ReservationDeliveryAttempt(
                            reservation_id=reservation.id,
                            business_id=reservation.business_id,
                            message_kind="reminder",
                            channel=channel,
                        )
                        db.add(attempt)
                        attempts[channel] = attempt

                    attempt.attempt_count = (attempt.attempt_count or 0) + 1
                    attempt.last_attempt_at = run_at
                    if channel == "email":
                        delivered = bool(reservation.email) and email_service.send_reservation_reminder(
                            to_email=reservation.email,
                            business_name=business.name,
                            management_url=management_url,
                        )
                    else:
                        delivered = bool(reservation.phone) and sms_service.send_sms(
                            reservation.phone, body
                        )

                    attempt.status = "delivered" if delivered else "failed"
                    attempt.delivered_at = run_at if delivered else None
                    attempt.last_error = None if delivered else "provider_rejected_or_unavailable"
                    delivered_any = delivered_any or delivered

                all_delivered = bool(configured_channels) and all(
                    attempts[channel].status == "delivered"
                    for channel in configured_channels
                )
                reservation.sms_reminder_sent = all_delivered
                if delivered_any:
                    sent += 1
                else:
                    skipped += 1

            await db.commit()
    finally:
        await engine.dispose()

    return ReminderRun(sent=sent, skipped=skipped)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    )
    result = asyncio.run(run_reservation_reminders())
    logger.info(
        "Reservation reminder run complete: sent=%d skipped=%d",
        result.sent,
        result.skipped,
    )


if __name__ == "__main__":
    main()
