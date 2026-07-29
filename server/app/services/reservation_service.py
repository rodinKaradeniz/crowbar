from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.reservation import Reservation
from app.models.table import Table
from app.models.table_assignment import ReservationTableAssignment
from app.models.user import User
from app.schemas.reservation import (
    PublicReservationCreate,
    ReservationCreate,
    ReservationReschedule,
    ReservationUpdate,
)
from app.services.availability_service import (
    AvailabilityError,
    ensure_public_booking_access,
    get_availability,
    validate_booking_slot,
    validate_override_slot,
)
from app.core.errors import ErrorCode
from app.services.customer_identity_service import upsert_customer
from app.services.location_service import get_primary_location
from app.services.floor_plan_service import _ensure_reservation_tables_available


async def get_reservations_by_business(
    db: AsyncSession,
    business_id: UUID,
    status: str | None = None,
) -> list[Reservation]:
    query = select(Reservation).where(Reservation.business_id == business_id)
    query = query.options(selectinload(Reservation.availability_override_user))
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
    query = query.options(selectinload(Reservation.availability_override_user))
    if for_update:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create_reservation(
    db: AsyncSession,
    *,
    business_id: UUID,
    data: ReservationCreate,
    override_actor: User | None = None,
    actor: User | None = None,
) -> Reservation:
    if data.availability_override_reason is not None:
        if override_actor is None:
            raise AvailabilityError(
                status_code=403,
                code=ErrorCode.AVAILABILITY_OVERRIDE_FORBIDDEN,
                message="Only owners and managers can override availability",
            )
        validated_slot = await validate_override_slot(
            db,
            business_id=business_id,
            service_type_id=data.service_type_id,
            starts_at=data.time,
            guests=data.guests,
        )
    else:
        validated_slot = await validate_booking_slot(
            db,
            business_id=business_id,
            service_type_id=data.service_type_id,
            starts_at=data.time,
            guests=data.guests,
        )
    service_type = validated_slot.service_type
    status = "pending" if service_type.is_pending_enabled else "confirmed"

    customer = await upsert_customer(
        db,
        business_id=business_id,
        phone=data.phone,
        email=data.email,
        name=data.name,
    )
    assert customer is not None
    location = await get_primary_location(db, business_id)

    reservation = Reservation(
        business_id=business_id,
        location_id=location.id if location else None,
        customer_id=customer.id,
        service_type_id=data.service_type_id,
        time=validated_slot.starts_at,
        ends_at=validated_slot.ends_at,
        phone=data.phone,
        email=data.email,
        note=data.note,
        status=status,
        guests=data.guests,
        channel="staff",
        availability_override_by=(
            override_actor.id if data.availability_override_reason else None
        ),
        availability_override_reason=data.availability_override_reason,
        availability_overridden_at=(
            datetime.now(timezone.utc)
            if data.availability_override_reason
            else None
        ),
    )
    if data.availability_override_reason:
        reservation.availability_override_user = override_actor
    db.add(reservation)
    await db.flush()
    await _apply_automatic_table_assignment(
        db,
        reservation=reservation,
        table_ids=validated_slot.table_ids,
        actor_id=actor.id if actor else None,
    )
    return reservation


async def _apply_automatic_table_assignment(
    db: AsyncSession,
    *,
    reservation: Reservation,
    table_ids: tuple[UUID, ...],
    actor_id: UUID | None,
) -> None:
    if not table_ids:
        return
    tables = list(
        (
            await db.execute(
                select(Table).where(
                    Table.business_id == reservation.business_id,
                    Table.id.in_(table_ids),
                )
            )
        ).scalars().all()
    )
    if len(tables) != len(table_ids) or len({table.location_id for table in tables}) != 1:
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.SLOT_UNAVAILABLE,
            message="The selected table allocation is no longer available",
        )
    reservation.location_id = tables[0].location_id
    assigned_at = datetime.now(timezone.utc)
    for table in tables:
        db.add(
            ReservationTableAssignment(
                reservation_id=reservation.id,
                table_id=table.id,
                business_id=reservation.business_id,
                location_id=table.location_id,
                assigned_by=actor_id,
                assigned_at=assigned_at,
            )
        )
    await db.flush()


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
    override_actor: User | None = None,
    actor: User | None = None,
    now: datetime | None = None,
) -> Reservation:
    ensure_reschedulable(reservation, now=now)
    if data.availability_override_reason is not None:
        if override_actor is None:
            raise AvailabilityError(
                status_code=403,
                code=ErrorCode.AVAILABILITY_OVERRIDE_FORBIDDEN,
                message="Only owners and managers can override availability",
            )
        validated_slot = await validate_override_slot(
            db,
            business_id=reservation.business_id,
            service_type_id=data.service_type_id,
            starts_at=data.time,
            guests=data.guests,
            now=now,
        )
    else:
        validated_slot = await validate_booking_slot(
            db,
            business_id=reservation.business_id,
            service_type_id=data.service_type_id,
            starts_at=data.time,
            guests=data.guests,
            now=now,
            exclude_reservation_id=reservation.id,
        )
    existing_table_ids = list(
        (
            await db.execute(
                select(ReservationTableAssignment.table_id).where(
                    ReservationTableAssignment.reservation_id == reservation.id
                )
            )
        ).scalars().all()
    )
    if existing_table_ids and not validated_slot.table_ids:
        await _ensure_reservation_tables_available(
            db,
            reservation=reservation,
            table_ids=existing_table_ids,
            starts_at=validated_slot.starts_at,
            ends_at=validated_slot.ends_at,
        )
    reservation.service_type_id = data.service_type_id
    reservation.time = validated_slot.starts_at
    reservation.ends_at = validated_slot.ends_at
    reservation.guests = data.guests
    reservation.sms_reminder_sent = False
    reservation.availability_override_by = (
        override_actor.id if data.availability_override_reason else None
    )
    reservation.availability_override_reason = data.availability_override_reason
    reservation.availability_overridden_at = (
        datetime.now(timezone.utc) if data.availability_override_reason else None
    )
    reservation.availability_override_user = (
        override_actor if data.availability_override_reason else None
    )
    if validated_slot.table_ids:
        await db.execute(
            delete(ReservationTableAssignment).where(
                ReservationTableAssignment.reservation_id == reservation.id
            )
        )
        await _apply_automatic_table_assignment(
            db,
            reservation=reservation,
            table_ids=validated_slot.table_ids,
            actor_id=actor.id if actor else None,
        )
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
    await ensure_public_booking_access(db, business_id=data.business_id)
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
    location = await get_primary_location(db, data.business_id)

    reservation = Reservation(
        business_id=data.business_id,
        location_id=location.id if location else None,
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
    await _apply_automatic_table_assignment(
        db,
        reservation=reservation,
        table_ids=validated_slot.table_ids,
        actor_id=None,
    )
    return reservation
