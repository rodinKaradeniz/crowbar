"""Expire offered waitlist entries in a retry-safe one-shot batch."""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.events import DomainEvent, publish
from app.services import notification_service
from app.services.reservation_waitlist_service import expire_due_offers

logger = logging.getLogger(__name__)


async def run_waitlist_expiry(*, now: datetime | None = None) -> int:
    run_at = now or datetime.now(timezone.utc)
    if run_at.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with session_factory() as db:
            entries = await expire_due_offers(db, now=run_at)
            for entry in entries:
                await notification_service.notify_business_staff(
                    db,
                    business_id=entry.business_id,
                    kind="waitlist_expired",
                    title="Waitlist offer expired",
                    body="The offer expired without creating a reservation.",
                    payload={"entry_id": str(entry.id)},
                )
            await db.commit()
            for entry in entries:
                await publish(
                    DomainEvent(
                        event_type="reservation.waitlist_expired",
                        business_id=str(entry.business_id),
                        payload={"entry_id": str(entry.id)},
                    )
                )
            return len(entries)
    finally:
        await engine.dispose()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    count = asyncio.run(run_waitlist_expiry())
    logger.info("waitlist expiry completed expired=%d", count)


if __name__ == "__main__":
    main()
