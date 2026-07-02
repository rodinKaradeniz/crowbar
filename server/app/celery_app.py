"""
Celery application for background tasks.

Dev usage:
    cd server
    celery -A app.celery_app worker --loglevel=info --pool=solo
    celery -A app.celery_app beat --loglevel=info   # for periodic tasks

The --pool=solo flag avoids fork issues on macOS and is fine for development.
In production use --pool=prefork (default) or --pool=gevent.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from celery import Celery
from celery.schedules import crontab

from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "crowbar",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        # Run hourly to catch reminders for reservations 24h away
        "send-reservation-reminders": {
            "task": "app.celery_app.send_reservation_reminders",
            "schedule": crontab(minute=0),  # every hour at :00
        },
    },
)


@celery_app.task(name="app.celery_app.send_reservation_reminders")
def send_reservation_reminders() -> dict:
    """
    Send SMS reminders for reservations occurring in approximately 24 hours.
    Queries confirmed reservations with time between now+23h and now+25h,
    and sends an SMS if the business has 'sms' in notification_channels.

    Returns a summary dict with counts.
    """
    return asyncio.run(_async_send_reminders())


async def _async_send_reminders() -> dict:
    """Async implementation of the reminder task."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.models.business import Business
    from app.models.reservation import Reservation
    from app.services import sms_service

    engine = create_async_engine(settings.database_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    now = datetime.now(timezone.utc)
    window_start = now + timedelta(hours=23)
    window_end = now + timedelta(hours=25)

    sent = 0
    skipped = 0

    try:
        async with async_session() as db:
            result = await db.execute(
                select(Reservation)
                .where(
                    Reservation.status == "confirmed",
                    Reservation.time >= window_start,
                    Reservation.time <= window_end,
                    Reservation.sms_reminder_sent == False,  # noqa: E712
                )
            )
            reservations = result.scalars().all()

            for reservation in reservations:
                # Load the business to check notification_channels
                biz_result = await db.execute(
                    select(Business).where(Business.id == reservation.business_id)
                )
                business = biz_result.scalar_one_or_none()
                if business is None:
                    skipped += 1
                    continue

                channels = business.notification_channels or []
                if "sms" not in channels:
                    skipped += 1
                    continue

                reservation_time_str = reservation.time.strftime("%A, %B %d at %I:%M %p UTC")
                body = (
                    f"Reminder from {business.name}: you have a reservation tomorrow "
                    f"({reservation_time_str}). Reply STOP to opt out."
                )
                ok = sms_service.send_sms(reservation.phone, body)
                if ok:
                    reservation.sms_reminder_sent = True
                    sent += 1
                else:
                    skipped += 1

            await db.commit()
    except Exception as e:
        logger.error("send_reservation_reminders task failed: %s", e)
    finally:
        await engine.dispose()

    logger.info("Reminder task complete: sent=%d skipped=%d", sent, skipped)
    return {"sent": sent, "skipped": skipped}
