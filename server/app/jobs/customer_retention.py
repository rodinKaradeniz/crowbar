"""Apply Crowbar's documented 24-month guest-data inactivity policy.

This is intentionally a one-shot job like reservation reminders. Scheduling it
in a deployment environment remains an explicit deployment task.
"""

import asyncio
import logging

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.services.customer_service import anonymize_inactive_customers

logger = logging.getLogger(__name__)


async def run_customer_retention() -> int:
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with session_factory() as db:
            count = await anonymize_inactive_customers(db)
            await db.commit()
            return count
    finally:
        await engine.dispose()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    count = asyncio.run(run_customer_retention())
    logger.info("customer retention completed anonymized=%d", count)


if __name__ == "__main__":
    main()
