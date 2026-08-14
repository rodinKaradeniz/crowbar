"""Compare inventory balances with the immutable movement ledger.

The job never changes stock. It records one open discrepancy per mismatched
item so managers can investigate without hiding the incident.
"""

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.business import Business
from app.services.inventory_service import reconcile_business

logger = logging.getLogger(__name__)


async def run_inventory_reconciliation() -> int:
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    incident_ids = set()
    try:
        async with session_factory() as db:
            business_ids = list((await db.scalars(select(Business.id))).all())
            for business_id in business_ids:
                incidents = await reconcile_business(db, business_id)
                incident_ids.update(incident.id for incident in incidents)
            await db.commit()
            return len(incident_ids)
    finally:
        await engine.dispose()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    count = asyncio.run(run_inventory_reconciliation())
    logger.info("inventory reconciliation completed open_incidents=%d", count)


if __name__ == "__main__":
    main()
