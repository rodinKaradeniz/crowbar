from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.staff import Staff
from app.schemas.staff import StaffCreate, StaffUpdate


async def get_staff_by_business(
    db: AsyncSession, business_id: UUID
) -> list[Staff]:
    result = await db.execute(
        select(Staff)
        .where(Staff.business_id == business_id)
        .options(selectinload(Staff.user))
        .order_by(Staff.created_at)
    )
    return list(result.scalars().all())


async def get_staff_by_id(db: AsyncSession, staff_id: UUID) -> Staff | None:
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    return result.scalar_one_or_none()


async def get_staff_by_user_id(db: AsyncSession, user_id: UUID) -> list[Staff]:
    result = await db.execute(
        select(Staff).where(Staff.user_id == user_id)
    )
    return list(result.scalars().all())


async def create_staff(db: AsyncSession, data: StaffCreate) -> Staff:
    staff = Staff(
        user_id=data.user_id,
        business_id=data.business_id,
        role=data.role,
    )
    db.add(staff)
    await db.flush()
    return staff


async def update_staff(
    db: AsyncSession, staff_id: UUID, data: StaffUpdate
) -> Staff | None:
    staff = await get_staff_by_id(db, staff_id)
    if staff is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(staff, key, value)

    await db.flush()
    return staff


async def delete_staff(db: AsyncSession, staff_id: UUID) -> bool:
    staff = await get_staff_by_id(db, staff_id)
    if staff is None:
        return False
    await db.delete(staff)
    await db.flush()
    return True
