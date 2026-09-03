"""Erase staff accounts whose 30-day deletion window has run out.

One-shot, like the other jobs here: scheduling it in a deployment environment
is an explicit deployment task (docs/deployment.md).
"""

import asyncio
import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.services.auth_service import anonymize_due_users

logger = logging.getLogger(__name__)


async def run_account_deletion(*, now: datetime | None = None) -> int:
    if now is not None and now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with session_factory() as db:
            count = await anonymize_due_users(db, now=now)
            await db.commit()
            return count
    finally:
        await engine.dispose()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    count = asyncio.run(run_account_deletion())
    logger.info("account deletion completed anonymized=%d", count)


if __name__ == "__main__":
    main()
