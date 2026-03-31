from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.reservation import Reservation
from app.models.service_type import ServiceType
from app.models.user import User
from app.schemas.reservation import (
    PublicReservationCreate,
    ReservationCreate,
    ReservationUpdate,
)
from app.services import google_meet_service


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
    db: AsyncSession,
    reservation_id: UUID,
    *,
    load_relations: bool = False,
) -> Reservation | None:
    query = select(Reservation).where(Reservation.id == reservation_id)
    if load_relations:
        query = query.options(
            selectinload(Reservation.business),
            selectinload(Reservation.service_type),
            selectinload(Reservation.customer),
        )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create_reservation(
    db: AsyncSession, customer_id: UUID, data: ReservationCreate
) -> Reservation:
    service_type = await _get_service_type(db, data.service_type_id)
    status = "pending" if service_type and service_type.is_pending_enabled else "confirmed"
    meeting_link = None
    if service_type and service_type.is_online:
        duration = service_type.duration or 60
        end_time = data.time + timedelta(minutes=duration)
        meeting_link = await google_meet_service.create_meet_link(
            db,
            data.business_id,
            summary=f"Reservation",
            start=data.time,
            end=end_time,
            attendee_email=data.email,
        )

    reservation = Reservation(
        business_id=data.business_id,
        customer_id=customer_id,
        service_type_id=data.service_type_id,
        time=data.time,
        phone=data.phone,
        email=data.email,
        note=data.note,
        status=status,
        guests=data.guests,
        payment_amount=data.payment_amount,
        payment_status=data.payment_status,
        meeting_link=meeting_link,
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


async def _get_service_type(
    db: AsyncSession, service_type_id: UUID
) -> ServiceType | None:
    result = await db.execute(
        select(ServiceType).where(ServiceType.id == service_type_id)
    )
    return result.scalar_one_or_none()


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

    service_type = await _get_service_type(db, data.service_type_id)
    status = "pending" if service_type and service_type.is_pending_enabled else "confirmed"
    meeting_link = None
    if service_type and service_type.is_online:
        duration = service_type.duration or 60
        end_time = data.time + timedelta(minutes=duration)
        meeting_link = await google_meet_service.create_meet_link(
            db,
            data.business_id,
            summary="Reservation",
            start=data.time,
            end=end_time,
            attendee_email=data.email,
        )

    reservation = Reservation(
        business_id=data.business_id,
        customer_id=user.id,
        service_type_id=data.service_type_id,
        time=data.time,
        phone=data.phone,
        email=data.email,
        note=data.note,
        status=status,
        guests=data.guests,
        meeting_link=meeting_link,
        custom_fields=data.custom_fields,
    )
    db.add(reservation)
    await db.flush()
    return reservation
