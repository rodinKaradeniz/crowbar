from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business import Business
from app.models.reservation import Reservation
from app.models.service_type import ServiceType
from app.schemas.reservation import (
    PublicReservationCreate,
    ReservationCreate,
    ReservationUpdate,
)
from app.services.customer_identity_service import upsert_customer


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
    db: AsyncSession, data: ReservationCreate
) -> Reservation:
    service_type = await _get_service_type(db, data.service_type_id)
    status = "pending" if service_type and service_type.is_pending_enabled else "confirmed"
    duration_minutes = await _get_reservation_duration_minutes(
        db, data.business_id, service_type
    )

    customer = await upsert_customer(
        db, business_id=data.business_id, phone=data.phone, email=data.email
    )

    reservation = Reservation(
        business_id=data.business_id,
        customer_id=customer.id,
        service_type_id=data.service_type_id,
        time=data.time,
        ends_at=data.time + timedelta(minutes=duration_minutes),
        phone=data.phone,
        email=data.email,
        note=data.note,
        status=status,
        guests=data.guests,
        channel="web",
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

    if "time" in update_data or "service_type_id" in update_data:
        service_type = await _get_service_type(db, reservation.service_type_id)
        duration_minutes = await _get_reservation_duration_minutes(
            db, reservation.business_id, service_type
        )
        reservation.ends_at = reservation.time + timedelta(
            minutes=duration_minutes
        )

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


async def _get_reservation_duration_minutes(
    db: AsyncSession,
    business_id: UUID,
    service_type: ServiceType | None,
) -> int:
    """Resolve today's legacy duration while the availability service is built.

    Persisting the result on each reservation prevents future configuration
    changes from rewriting the historical occupied interval.
    """
    if service_type is not None and service_type.duration is not None:
        return max(service_type.duration, 1)

    result = await db.execute(
        select(Business.reservation_time).where(Business.id == business_id)
    )
    return max(result.scalar_one_or_none() or 60, 1)


async def create_public_reservation(
    db: AsyncSession, data: PublicReservationCreate
) -> Reservation:
    """Create a reservation from the public form (no login required).

    Upserts a Customer (business-scoped, keyed by phone) and links the
    reservation to it.
    """
    service_type = await _get_service_type(db, data.service_type_id)
    status = "pending" if service_type and service_type.is_pending_enabled else "confirmed"
    duration_minutes = await _get_reservation_duration_minutes(
        db, data.business_id, service_type
    )

    customer = await upsert_customer(
        db,
        business_id=data.business_id,
        phone=data.phone,
        email=data.email,
        name=data.name,
    )

    reservation = Reservation(
        business_id=data.business_id,
        customer_id=customer.id,
        service_type_id=data.service_type_id,
        time=data.time,
        ends_at=data.time + timedelta(minutes=duration_minutes),
        phone=data.phone,
        email=data.email,
        note=data.note,
        status=status,
        guests=data.guests,
        channel="web",
    )
    db.add(reservation)
    await db.flush()
    return reservation
