from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reservation import Reservation
from app.models.user import User
from app.schemas.reservation import (
    PublicReservationCreate,
    ReservationCreate,
    ReservationUpdate,
)


async def get_reservations_by_business(
    db: AsyncSession,
    business_id: UUID,
    status: str | None = None,
) -> list[Reservation]:
    query = select(Reservation).where(Reservation.business_id == business_id)
    if status:
        query = query.where(Reservation.status == status)
    query = query.order_by(Reservation.time.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_reservations_by_customer(
    db: AsyncSession, customer_id: UUID
) -> list[Reservation]:
    result = await db.execute(
        select(Reservation)
        .where(Reservation.customer_id == customer_id)
        .order_by(Reservation.time.desc())
    )
    return list(result.scalars().all())


async def get_reservation_by_id(
    db: AsyncSession, reservation_id: UUID
) -> Reservation | None:
    result = await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )
    return result.scalar_one_or_none()


async def create_reservation(
    db: AsyncSession, customer_id: UUID, data: ReservationCreate
) -> Reservation:
    reservation = Reservation(
        business_id=data.business_id,
        customer_id=customer_id,
        service_type_id=data.service_type_id,
        time=data.time,
        phone=data.phone,
        email=data.email,
        note=data.note,
        guests=data.guests,
        payment_amount=data.payment_amount,
        payment_status=data.payment_status,
    )
    db.add(reservation)
    await db.flush()
    return reservation


async def update_reservation(
    db: AsyncSession, reservation_id: UUID, data: ReservationUpdate
) -> Reservation | None:
    reservation = await get_reservation_by_id(db, reservation_id)
    if reservation is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(reservation, key, value)

    await db.flush()
    await db.refresh(reservation)
    return reservation


async def delete_reservation(db: AsyncSession, reservation_id: UUID) -> bool:
    reservation = await get_reservation_by_id(db, reservation_id)
    if reservation is None:
        return False
    await db.delete(reservation)
    await db.flush()
    return True


async def create_public_reservation(
    db: AsyncSession, data: PublicReservationCreate
) -> Reservation:
    """Create a reservation from the public form (no login required).

    Looks up an existing customer user by email. If none exists, creates a
    lightweight guest customer account (no password — they can register later
    to claim it).
    """
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            email=data.email,
            name=data.name,
            phone=data.phone,
            password_hash="",  # guest account — no login until they register
            user_type="customer",
        )
        db.add(user)
        await db.flush()

    reservation = Reservation(
        business_id=data.business_id,
        customer_id=user.id,
        service_type_id=data.service_type_id,
        time=data.time,
        phone=data.phone,
        email=data.email,
        note=data.note,
        guests=data.guests,
        custom_fields=data.custom_fields,
    )
    db.add(reservation)
    await db.flush()
    return reservation
