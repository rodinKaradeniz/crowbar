from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.reservation import Reservation
from app.schemas.reservation import (
    PublicReservationCreate,
    ReservationCreate,
    ReservationReschedule,
    ReservationUpdate,
)
from app.services.availability_service import (
    AvailabilityError,
    get_availability,
    validate_booking_slot,
)
from app.core.errors import ErrorCode
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
    business_id: UUID,
    load_relations: bool = False,
    for_update: bool = False,
) -> Reservation | None:
    query = select(Reservation).where(
        Reservation.id == reservation_id,
        Reservation.business_id == business_id,
    )
    if load_relations:
        query = query.options(
            selectinload(Reservation.business),
            selectinload(Reservation.service_type),
            selectinload(Reservation.customer),
        )
    if for_update:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create_reservation(
    db: AsyncSession, data: ReservationCreate
) -> Reservation:
    validated_slot = await validate_booking_slot(
        db,
        business_id=data.business_id,
        service_type_id=data.service_type_id,
        starts_at=data.time,
        guests=data.guests,
    )
    service_type = validated_slot.service_type
    status = "pending" if service_type.is_pending_enabled else "confirmed"

    customer = await upsert_customer(
        db, business_id=data.business_id, phone=data.phone, email=data.email
    )

    reservation = Reservation(
        business_id=data.business_id,
        customer_id=customer.id,
        service_type_id=data.service_type_id,
        time=validated_slot.starts_at,
        ends_at=validated_slot.ends_at,
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
    db: AsyncSession,
    *,
    reservation: Reservation,
    data: ReservationUpdate,
) -> Reservation:
    update_data = data.model_dump(exclude_unset=True)
    if (
        reservation.status in {"cancelled", "completed"}
        and update_data.get("status") in {"pending", "confirmed"}
    ):
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.RESERVATION_NOT_RESCHEDULABLE,
            message="Cancelled or completed reservations cannot be reactivated",
        )
    for key, value in update_data.items():
        setattr(reservation, key, value)

    await db.flush()
    await db.refresh(reservation)
    return reservation


async def delete_reservation(
    db: AsyncSession,
    *,
    reservation: Reservation,
) -> None:
    await db.delete(reservation)
    await db.flush()


def ensure_reschedulable(
    reservation: Reservation,
    *,
    now: datetime | None = None,
) -> None:
    current_time = now or datetime.now(timezone.utc)
    if reservation.status not in {"pending", "confirmed"}:
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.RESERVATION_NOT_RESCHEDULABLE,
            message="Only pending or confirmed reservations can be rescheduled",
        )
    if reservation.time <= current_time:
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.RESERVATION_NOT_RESCHEDULABLE,
            message="Past reservations cannot be rescheduled",
        )


async def get_reschedule_availability(
    db: AsyncSession,
    *,
    reservation: Reservation,
    service_type_id: UUID,
    start_date: date,
    days: int,
    guests: int,
    now: datetime | None = None,
):
    ensure_reschedulable(reservation, now=now)
    return await get_availability(
        db,
        business_id=reservation.business_id,
        service_type_id=service_type_id,
        start_date=start_date,
        days=days,
        guests=guests,
        now=now,
        exclude_reservation_id=reservation.id,
    )


async def reschedule_reservation(
    db: AsyncSession,
    *,
    reservation: Reservation,
    data: ReservationReschedule,
    now: datetime | None = None,
) -> Reservation:
    ensure_reschedulable(reservation, now=now)
    validated_slot = await validate_booking_slot(
        db,
        business_id=reservation.business_id,
        service_type_id=data.service_type_id,
        starts_at=data.time,
        guests=data.guests,
        now=now,
        exclude_reservation_id=reservation.id,
    )
    reservation.service_type_id = data.service_type_id
    reservation.time = validated_slot.starts_at
    reservation.ends_at = validated_slot.ends_at
    reservation.guests = data.guests
    reservation.sms_reminder_sent = False
    reservation.availability_override_by = None
    reservation.availability_override_reason = None
    reservation.availability_overridden_at = None
    await db.flush()
    await db.refresh(reservation)
    return reservation


async def create_public_reservation(
    db: AsyncSession, data: PublicReservationCreate
) -> Reservation:
    """Create a reservation from the public form (no login required).

    Upserts a Customer (business-scoped, keyed by phone) and links the
    reservation to it.
    """
    validated_slot = await validate_booking_slot(
        db,
        business_id=data.business_id,
        service_type_id=data.service_type_id,
        starts_at=data.time,
        guests=data.guests,
    )
    service_type = validated_slot.service_type
    status = "pending" if service_type.is_pending_enabled else "confirmed"

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
        time=validated_slot.starts_at,
        ends_at=validated_slot.ends_at,
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
