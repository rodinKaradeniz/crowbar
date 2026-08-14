from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode
from app.models.reservation import Reservation
from app.models.business import Business
from app.models.reservation_waitlist import ReservationWaitlistEntry
from app.models.service_type import ServiceType
from app.models.user import User
from app.schemas.reservation import ReservationCreate
from app.schemas.reservation_waitlist import ReservationWaitlistCreate
from app.services.availability_service import AvailabilityError, ensure_public_booking_access, validate_booking_slot
from app.services.customer_identity_service import upsert_customer
from app.services.reservation_service import create_reservation
from app.core.regional import RegionalValidationError, normalize_phone


OFFER_MINUTES = 15


async def create_waitlist_entry(
    db: AsyncSession,
    *,
    data: ReservationWaitlistCreate,
    actor: User | None = None,
    public: bool = True,
) -> ReservationWaitlistEntry:
    business = await db.get(Business, data.business_id)
    if business is None:
        raise AvailabilityError(status_code=404, code=ErrorCode.NOT_FOUND, message="Business not found")
    try:
        normalized_phone = normalize_phone(data.phone, business.country_code)
    except RegionalValidationError as exc:
        raise AvailabilityError(status_code=422, code=ErrorCode.VALIDATION_ERROR, message=str(exc)) from exc
    if public:
        await ensure_public_booking_access(db, business_id=data.business_id)
    service = await db.scalar(
        select(ServiceType).where(
            ServiceType.id == data.service_type_id,
            ServiceType.business_id == data.business_id,
        )
    )
    if service is None:
        raise AvailabilityError(status_code=404, code=ErrorCode.NOT_FOUND, message="Service type not found")
    if data.requested_starts_at.tzinfo is None or data.flexible_until.tzinfo is None:
        raise AvailabilityError(status_code=422, code=ErrorCode.VALIDATION_ERROR, message="Waitlist times must include a timezone")
    if data.flexible_until < data.requested_starts_at:
        raise AvailabilityError(status_code=422, code=ErrorCode.VALIDATION_ERROR, message="Flexible window must end after the preferred time")
    if data.requested_starts_at <= datetime.now(timezone.utc):
        raise AvailabilityError(status_code=409, code=ErrorCode.BOOKING_UNAVAILABLE, message="Waitlist requests must be in the future")
    customer = await upsert_customer(
        db, business_id=data.business_id, phone=normalized_phone, email=data.email, name=data.name
    )
    assert customer is not None
    entry = ReservationWaitlistEntry(
        business_id=data.business_id,
        service_type_id=data.service_type_id,
        customer_id=customer.id,
        requested_starts_at=data.requested_starts_at,
        flexible_until=data.flexible_until,
        guests=data.guests,
        created_by=actor.id if actor else None,
    )
    db.add(entry)
    await db.flush()
    return entry


async def list_waitlist_entries(db: AsyncSession, *, business_id: UUID) -> list[ReservationWaitlistEntry]:
    now = datetime.now(timezone.utc)
    await db.execute(
        select(ReservationWaitlistEntry)
        .where(
            ReservationWaitlistEntry.business_id == business_id,
            ReservationWaitlistEntry.status == "offered",
            ReservationWaitlistEntry.offer_expires_at <= now,
        )
        .with_for_update()
    )
    # Expire before presentation; this is deliberately opportunistic rather than a cron.
    entries = list((await db.execute(
        select(ReservationWaitlistEntry)
        .where(ReservationWaitlistEntry.business_id == business_id)
        .order_by(ReservationWaitlistEntry.requested_starts_at, ReservationWaitlistEntry.created_at)
    )).scalars().all())
    for entry in entries:
        if entry.status == "offered" and entry.offer_expires_at and entry.offer_expires_at <= now:
            entry.status = "expired"
            entry.offer_expires_at = None
            entry.offer_token_revision += 1
    await db.flush()
    return entries


async def offer_waitlist_entry(
    db: AsyncSession,
    *,
    business_id: UUID,
    entry_id: UUID,
    reservation_time: datetime,
) -> ReservationWaitlistEntry:
    entry = await db.scalar(
        select(ReservationWaitlistEntry).where(
            ReservationWaitlistEntry.id == entry_id,
            ReservationWaitlistEntry.business_id == business_id,
        ).with_for_update()
    )
    if entry is None:
        raise AvailabilityError(status_code=404, code=ErrorCode.NOT_FOUND, message="Waitlist entry not found")
    if entry.status != "waiting":
        raise AvailabilityError(status_code=409, code=ErrorCode.CONFLICT, message="Only waiting guests can receive an offer")
    if not entry.requested_starts_at <= reservation_time <= entry.flexible_until:
        raise AvailabilityError(status_code=422, code=ErrorCode.VALIDATION_ERROR, message="Offer must be within the guest's flexible window")
    await validate_booking_slot(
        db,
        business_id=business_id,
        service_type_id=entry.service_type_id,
        starts_at=reservation_time,
        guests=entry.guests,
    )
    entry.status = "offered"
    entry.offered_at = datetime.now(timezone.utc)
    entry.offered_reservation_time = reservation_time
    entry.offer_expires_at = entry.offered_at + timedelta(minutes=OFFER_MINUTES)
    await db.flush()
    return entry


async def accept_waitlist_offer(
    db: AsyncSession,
    *,
    entry: ReservationWaitlistEntry,
) -> Reservation:
    now = datetime.now(timezone.utc)
    if entry.status != "offered" or not entry.offer_expires_at or entry.offer_expires_at <= now:
        raise AvailabilityError(status_code=409, code=ErrorCode.SLOT_UNAVAILABLE, message="This waitlist offer has expired")
    reservation_time = entry.offered_reservation_time
    if reservation_time is None:
        raise AvailabilityError(status_code=409, code=ErrorCode.CONFLICT, message="This waitlist offer is invalid")
    # The canonical customer is queried explicitly so the reservation path remains phone-keyed.
    from app.models.customer import Customer
    customer = await db.get(Customer, entry.customer_id)
    if customer is None:
        raise AvailabilityError(status_code=409, code=ErrorCode.CONFLICT, message="Guest profile is unavailable")
    reservation = await create_reservation(
        db,
        business_id=entry.business_id,
        data=ReservationCreate(
            service_type_id=entry.service_type_id,
            time=reservation_time,
            name=customer.name or "Guest",
            phone=customer.phone or "",
            email=customer.email or "guest@example.invalid",
            guests=entry.guests,
        ),
    )
    reservation.channel = "waitlist"
    entry.status = "accepted"
    entry.accepted_at = now
    entry.offer_expires_at = None
    entry.offer_token_revision += 1
    await db.flush()
    return reservation
