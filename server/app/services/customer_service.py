from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reservation import Reservation
from app.models.user import User


async def get_customers(db: AsyncSession) -> list[User]:
    result = await db.execute(
        select(User).where(User.user_type == "customer").order_by(User.created_at)
    )
    return list(result.scalars().all())


async def get_customer_by_id(db: AsyncSession, customer_id: UUID) -> User | None:
    result = await db.execute(
        select(User).where(User.id == customer_id, User.user_type == "customer")
    )
    return result.scalar_one_or_none()


async def get_customers_by_business(db: AsyncSession, business_id: UUID) -> list[User]:
    result = await db.execute(
        select(User)
        .join(Reservation, Reservation.customer_id == User.id)
        .where(Reservation.business_id == business_id)
        .distinct()
        .order_by(User.name)
    )
    return list(result.scalars().all())
