from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.schemas.business import BusinessCreate, BusinessUpdate


async def get_businesses(db: AsyncSession) -> list[Business]:
    result = await db.execute(select(Business).order_by(Business.created_at))
    return list(result.scalars().all())


async def get_business_by_id(db: AsyncSession, business_id: UUID) -> Business | None:
    result = await db.execute(select(Business).where(Business.id == business_id))
    return result.scalar_one_or_none()


async def get_business_by_slug(db: AsyncSession, slug: str) -> Business | None:
    result = await db.execute(select(Business).where(Business.slug == slug))
    return result.scalar_one_or_none()


async def create_business(db: AsyncSession, data: BusinessCreate) -> Business:
    business = Business(
        name=data.name,
        slug=data.slug,
        email=data.email,
        phone=data.phone,
        timezone=data.timezone,
        address=data.address,
        description=data.description,
        image=data.image,
        website=data.website,
        tags=data.tags or [],
        max_guests=data.max_guests,
        reservation_time=data.reservation_time,
        time_slot_interval=data.time_slot_interval,
        advance_booking_days=data.advance_booking_days,
        operating_hours={k: v.model_dump() for k, v in data.operating_hours.items()},
    )
    db.add(business)
    await db.flush()
    return business


async def update_business(
    db: AsyncSession, business_id: UUID, data: BusinessUpdate
) -> Business | None:
    business = await get_business_by_id(db, business_id)
    if business is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    if "operating_hours" in update_data and update_data["operating_hours"] is not None:
        update_data["operating_hours"] = {
            k: v.model_dump() if hasattr(v, "model_dump") else v
            for k, v in update_data["operating_hours"].items()
        }

    for key, value in update_data.items():
        setattr(business, key, value)

    await db.flush()
    return business


async def delete_business(db: AsyncSession, business_id: UUID) -> bool:
    business = await get_business_by_id(db, business_id)
    if business is None:
        return False
    await db.delete(business)
    await db.flush()
    return True
