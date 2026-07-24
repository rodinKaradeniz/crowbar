"""Send the hourly reservation-reminder batch, then exit.

Production runs this module as a Railway Cron job:

    python -m app.jobs.reservation_reminders
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.business import Business
from app.models.reservation import Reservation
from app.services import sms_service

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReminderRun:
    sent: int
    skipped: int


async def run_reservation_reminders(
    *, now: datetime | None = None
) -> ReminderRun:
    """Send unsent reminders for confirmed reservations about 24 hours away."""
    run_at = now or datetime.now(timezone.utc)
    if run_at.tzinfo is None:
        raise ValueError("now must be timezone-aware")

    window_start = run_at + timedelta(hours=23)
    window_end = run_at + timedelta(hours=25)

    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    sent = 0
    skipped = 0

    try:
        async with session_factory() as db:
            result = await db.execute(
                select(Reservation, Business)
                .join(Business, Business.id == Reservation.business_id)
                .where(
                    Reservation.status == "confirmed",
                    Reservation.time >= window_start,
                    Reservation.time <= window_end,
                    Reservation.sms_reminder_sent.is_(False),
                )
                .order_by(Reservation.time, Reservation.id)
            )

            for reservation, business in result.all():
                channels = business.notification_channels or []
                if "sms" not in channels:
                    skipped += 1
                    continue

                reservation_time = reservation.time.strftime(
                    "%A, %B %d at %I:%M %p UTC"
                )
                body = (
                    f"Reminder from {business.name}: you have a reservation "
                    f"tomorrow ({reservation_time}). Reply STOP to opt out."
                )

                if sms_service.send_sms(reservation.phone, body):
                    reservation.sms_reminder_sent = True
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
