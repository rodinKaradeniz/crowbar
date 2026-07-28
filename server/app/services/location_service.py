from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.location import Location


async def get_primary_location(
    db: AsyncSession, business_id: UUID
) -> Location | None:
    return await db.scalar(
        select(Location).where(
            Location.business_id == business_id,
            Location.is_primary.is_(True),
        )
    )
