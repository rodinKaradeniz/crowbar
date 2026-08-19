from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode
from app.core.regional import RegionalValidationError, normalize_phone
from app.models.business import Business
from app.models.customer import Customer
from app.models.reservation import Reservation
from app.models.reservation_delivery_attempt import DeliveryAttempt
from app.models.reservation_waitlist import ReservationWaitlistEntry
from app.models.service_type import ServiceType
from app.models.user import User
from app.schemas.reservation import ReservationCreate
from app.schemas.reservation_waitlist import ReservationWaitlistCreate
from app.services import email_service, sms_service
from app.services.availability_service import (
    AvailabilityError,
    ensure_public_booking_access,
    get_availability,
    validate_booking_slot,
)
from app.services.customer_identity_service import upsert_customer
from app.services.reservation_service import create_reservation


OFFER_MINUTES = 15
ACTIVE_STATUSES = ("waiting", "offered")
TERMINAL_STATUSES = ("accepted", "declined", "cancelled", "expired", "removed")


def _fingerprint(data: ReservationWaitlistCreate, normalized_phone: str) -> str:
    payload = json.dumps(
        {
            "service_type_id": str(data.service_type_id),
            "requested_starts_at": data.requested_starts_at.astimezone(timezone.utc).isoformat(),
            "flexible_until": data.flexible_until.astimezone(timezone.utc).isoformat(),
            "guests": data.guests,
            "name": data.name.strip(),
            "phone": normalized_phone,
            "email": str(data.email).strip().lower(),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


async def _matching_slot_exists(
    db: AsyncSession, *, business: Business, data: ReservationWaitlistCreate
) -> bool:
    zone = ZoneInfo(business.timezone)
    first_date = data.requested_starts_at.astimezone(zone).date()
    last_date = data.flexible_until.astimezone(zone).date()
    days = (last_date - first_date).days + 1
    if days > 31:
        raise AvailabilityError(
            status_code=422,
            code=ErrorCode.VALIDATION_ERROR,
            message="A waitlist flexibility window cannot exceed 31 calendar days",
        )
    availability = await get_availability(
        db,
        business_id=business.id,
        service_type_id=data.service_type_id,
        start_date=first_date,
        days=days,
        guests=data.guests,
    )
    requested = data.requested_starts_at.astimezone(timezone.utc)
    flexible = data.flexible_until.astimezone(timezone.utc)
    return any(
        requested <= slot.starts_at.astimezone(timezone.utc) <= flexible
        for day in availability.dates
        for slot in day.slots
    )


async def create_waitlist_entry(
    db: AsyncSession,
    *,
    data: ReservationWaitlistCreate,
    actor: User | None = None,
    public: bool = True,
) -> tuple[ReservationWaitlistEntry, bool]:
    business = await db.scalar(
        select(Business).where(Business.id == data.business_id).with_for_update()
    )
    if business is None:
        raise AvailabilityError(
            status_code=404, code=ErrorCode.NOT_FOUND, message="Business not found"
        )
    try:
        normalized_phone = normalize_phone(data.phone, business.country_code)
    except RegionalValidationError as exc:
        raise AvailabilityError(
            status_code=422, code=ErrorCode.VALIDATION_ERROR, message=str(exc)
        ) from exc
    if public:
        await ensure_public_booking_access(db, business_id=data.business_id)
    service = await db.scalar(
        select(ServiceType).where(
            ServiceType.id == data.service_type_id,
            ServiceType.business_id == data.business_id,
        )
    )
    if service is None:
        raise AvailabilityError(
            status_code=404, code=ErrorCode.NOT_FOUND, message="Service type not found"
        )
    if data.requested_starts_at.tzinfo is None or data.flexible_until.tzinfo is None:
        raise AvailabilityError(
            status_code=422,
            code=ErrorCode.VALIDATION_ERROR,
            message="Waitlist times must include a timezone",
        )
    if data.flexible_until < data.requested_starts_at:
        raise AvailabilityError(
            status_code=422,
            code=ErrorCode.VALIDATION_ERROR,
            message="Flexible window must end after the preferred time",
        )
    if data.requested_starts_at <= datetime.now(timezone.utc):
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.BOOKING_UNAVAILABLE,
            message="Waitlist requests must be in the future",
        )

    fingerprint = _fingerprint(data, normalized_phone)
    existing = await db.scalar(
        select(ReservationWaitlistEntry).where(
            ReservationWaitlistEntry.business_id == data.business_id,
            ReservationWaitlistEntry.idempotency_key == data.idempotency_key,
        )
    )
    if existing is not None:
        if existing.request_fingerprint != fingerprint:
            raise AvailabilityError(
                status_code=409,
                code=ErrorCode.CONFLICT,
                message="This idempotency key was already used for a different waitlist request",
            )
        return existing, False

    if await _matching_slot_exists(db, business=business, data=data):
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.BOOKING_UNAVAILABLE,
            message="A matching reservation time is currently available",
            details={"reason": "LIVE_SLOT_AVAILABLE"},
        )

    customer = await upsert_customer(
        db,
        business_id=data.business_id,
        phone=normalized_phone,
        email=data.email,
        name=data.name,
    )
    assert customer is not None
    entry = ReservationWaitlistEntry(
        business_id=data.business_id,
        service_type_id=data.service_type_id,
        customer_id=customer.id,
        requested_starts_at=data.requested_starts_at,
        flexible_until=data.flexible_until,
        guests=data.guests,
        idempotency_key=data.idempotency_key,
        request_fingerprint=fingerprint,
        created_by=actor.id if actor else None,
    )
    db.add(entry)
    await db.flush()
    return entry, True


def _terminalize(
    entry: ReservationWaitlistEntry,
    *,
    status: str,
    actor_id: UUID | None,
    reason_code: str,
    note: str | None,
    now: datetime,
) -> None:
    entry.status = status
    entry.terminal_at = now
    entry.terminal_actor_id = actor_id
    entry.terminal_reason_code = reason_code
    entry.terminal_reason_note = note
    entry.offer_expires_at = None
    entry.offer_token_revision += 1
    entry.management_token_revision += 1


async def expire_entry_if_due(
    db: AsyncSession, entry: ReservationWaitlistEntry, *, now: datetime | None = None
) -> bool:
    current = now or datetime.now(timezone.utc)
    if (
        entry.status == "offered"
        and entry.offer_expires_at is not None
        and entry.offer_expires_at <= current
    ):
        _terminalize(
            entry,
            status="expired",
            actor_id=None,
            reason_code="offer_expired",
            note=None,
            now=current,
        )
        await db.flush()
        return True
    return False


async def expire_due_offers(
    db: AsyncSession, *, limit: int = 100, now: datetime | None = None
) -> list[ReservationWaitlistEntry]:
    current = now or datetime.now(timezone.utc)
    rows = await db.scalars(
        select(ReservationWaitlistEntry)
        .where(
            ReservationWaitlistEntry.status == "offered",
            ReservationWaitlistEntry.offer_expires_at <= current,
        )
        .order_by(ReservationWaitlistEntry.offer_expires_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    expired = list(rows.all())
    for entry in expired:
        _terminalize(
            entry,
            status="expired",
            actor_id=None,
            reason_code="offer_expired",
            note=None,
            now=current,
        )
    await db.flush()
    return expired


async def list_waitlist_entries(
    db: AsyncSession, *, business_id: UUID, view: str = "active"
) -> list[ReservationWaitlistEntry]:
    await expire_due_offers(db)
    statuses = ACTIVE_STATUSES if view == "active" else TERMINAL_STATUSES
    rows = await db.scalars(
        select(ReservationWaitlistEntry)
        .where(
            ReservationWaitlistEntry.business_id == business_id,
            ReservationWaitlistEntry.status.in_(statuses),
        )
        .order_by(
            ReservationWaitlistEntry.requested_starts_at,
            ReservationWaitlistEntry.created_at,
        )
    )
    return list(rows.all())


async def offer_waitlist_entry(
    db: AsyncSession,
    *,
    business_id: UUID,
    entry_id: UUID,
    reservation_time: datetime,
) -> ReservationWaitlistEntry:
    entry = await db.scalar(
        select(ReservationWaitlistEntry)
        .where(
            ReservationWaitlistEntry.id == entry_id,
            ReservationWaitlistEntry.business_id == business_id,
        )
        .with_for_update()
    )
    if entry is None:
        raise AvailabilityError(
            status_code=404, code=ErrorCode.NOT_FOUND, message="Waitlist entry not found"
        )
    await expire_entry_if_due(db, entry)
    if entry.status != "waiting":
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.CONFLICT,
            message="Only waiting guests can receive an offer",
        )
    if not entry.requested_starts_at <= reservation_time <= entry.flexible_until:
        raise AvailabilityError(
            status_code=422,
            code=ErrorCode.VALIDATION_ERROR,
            message="Offer must be within the guest's flexible window",
        )
    await validate_booking_slot(
        db,
        business_id=business_id,
        service_type_id=entry.service_type_id,
        starts_at=reservation_time,
        guests=entry.guests,
    )
    now = datetime.now(timezone.utc)
    entry.status = "offered"
    entry.offered_at = now
    entry.offered_reservation_time = reservation_time
    entry.offer_expires_at = now + timedelta(minutes=OFFER_MINUTES)
    customer = await db.get(Customer, entry.customer_id)
    business = await db.get(Business, business_id)
    if customer and customer.email and business and "email" in (business.notification_channels or []):
        db.add(
            DeliveryAttempt(
                business_id=business_id,
                waitlist_entry_id=entry.id,
                message_kind="waitlist_offer",
                channel="email",
                status="pending",
            )
        )
    await db.flush()
    return entry


async def deliver_waitlist_offer(
    db: AsyncSession,
    *,
    business_id: UUID,
    entry_id: UUID,
    offer_url: str,
    channel: str,
) -> DeliveryAttempt | None:
    entry = await db.scalar(
        select(ReservationWaitlistEntry).where(
            ReservationWaitlistEntry.id == entry_id,
            ReservationWaitlistEntry.business_id == business_id,
        )
    )
    if entry is None:
        return None
    attempt = await db.scalar(
        select(DeliveryAttempt)
        .where(
            DeliveryAttempt.waitlist_entry_id == entry_id,
            DeliveryAttempt.message_kind == "waitlist_offer",
            DeliveryAttempt.channel == channel,
        )
        .with_for_update()
    )
    if attempt is None or attempt.status == "delivered":
        return attempt
    customer = await db.get(Customer, entry.customer_id)
    business = await db.get(Business, business_id)
    if customer is None or business is None:
        return None
    attempt.attempt_count += 1
    attempt.last_attempt_at = datetime.now(timezone.utc)
    await db.flush()
    if channel == "email":
        sent = bool(
            customer.email
            and email_service.send_waitlist_offer(
                to_email=customer.email,
                business_name=business.name,
                offer_url=offer_url,
            )
        )
    else:
        sent = bool(
            customer.phone
            and sms_service.send_sms(
                customer.phone,
                f"{business.name} has a table available. Respond here: {offer_url}",
            )
        )
    if sent:
        attempt.status = "delivered"
        attempt.delivered_at = datetime.now(timezone.utc)
        attempt.last_error = None
    else:
        attempt.status = "failed"
        attempt.last_error = f"{channel.upper()} delivery failed or is not configured"
    await db.flush()
    return attempt


async def prepare_waitlist_sms_fallback(
    db: AsyncSession, *, business_id: UUID, entry_id: UUID
) -> DeliveryAttempt | None:
    business = await db.get(Business, business_id)
    entry = await db.get(ReservationWaitlistEntry, entry_id)
    customer = await db.get(Customer, entry.customer_id) if entry else None
    if (
        business is None
        or entry is None
        or customer is None
        or not customer.phone
        or "sms" not in (business.notification_channels or [])
    ):
        return None
    attempt = await db.scalar(
        select(DeliveryAttempt).where(
            DeliveryAttempt.waitlist_entry_id == entry_id,
            DeliveryAttempt.message_kind == "waitlist_offer",
            DeliveryAttempt.channel == "sms",
        )
    )
    if attempt is None:
        attempt = DeliveryAttempt(
            business_id=business_id,
            waitlist_entry_id=entry_id,
            message_kind="waitlist_offer",
            channel="sms",
            status="pending",
        )
        db.add(attempt)
        await db.flush()
    return attempt


async def delivery_state(db: AsyncSession, entry_id: UUID) -> str:
    attempts = list(
        (
            await db.scalars(
                select(DeliveryAttempt).where(
                    DeliveryAttempt.waitlist_entry_id == entry_id,
                    DeliveryAttempt.message_kind == "waitlist_offer",
                )
            )
        ).all()
    )
    if any(item.status == "delivered" for item in attempts):
        return "delivered"
    if any(item.status == "pending" for item in attempts):
        return "pending"
    if any(item.status == "failed" for item in attempts):
        return "failed"
    return "unavailable"


async def accept_waitlist_offer(
    db: AsyncSession, *, entry: ReservationWaitlistEntry
) -> Reservation:
    if entry.status == "accepted" and entry.accepted_reservation_id:
        existing = await db.get(Reservation, entry.accepted_reservation_id)
        if existing is not None:
            return existing
    if await expire_entry_if_due(db, entry):
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.SLOT_UNAVAILABLE,
            message="This waitlist offer has expired",
        )
    if entry.status != "offered" or not entry.offer_expires_at:
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.SLOT_UNAVAILABLE,
            message="This waitlist offer is no longer available",
        )
    reservation_time = entry.offered_reservation_time
    if reservation_time is None:
        raise AvailabilityError(
            status_code=409, code=ErrorCode.CONFLICT, message="This waitlist offer is invalid"
        )
    customer = await db.get(Customer, entry.customer_id)
    if customer is None:
        raise AvailabilityError(
            status_code=409, code=ErrorCode.CONFLICT, message="Guest profile is unavailable"
        )
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
    now = datetime.now(timezone.utc)
    entry.status = "accepted"
    entry.accepted_at = now
    entry.accepted_reservation_id = reservation.id
    entry.terminal_at = now
    entry.terminal_reason_code = "offer_accepted"
    entry.offer_expires_at = None
    entry.management_token_revision += 1
    await db.flush()
    return reservation


async def terminal_command(
    db: AsyncSession,
    *,
    business_id: UUID,
    entry_id: UUID,
    status: str,
    actor_id: UUID | None,
    reason_code: str,
    note: str | None,
) -> ReservationWaitlistEntry:
    entry = await db.scalar(
        select(ReservationWaitlistEntry)
        .where(
            ReservationWaitlistEntry.id == entry_id,
            ReservationWaitlistEntry.business_id == business_id,
        )
        .with_for_update()
    )
    if entry is None:
        raise AvailabilityError(
            status_code=404, code=ErrorCode.NOT_FOUND, message="Waitlist entry not found"
        )
    await expire_entry_if_due(db, entry)
    allowed = {"declined": ("offered",), "cancelled": ACTIVE_STATUSES, "removed": ACTIVE_STATUSES}
    if entry.status not in allowed[status]:
        if entry.status == status:
            return entry
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.CONFLICT,
            message=f"This waitlist request cannot be marked {status}",
        )
    _terminalize(
        entry,
        status=status,
        actor_id=actor_id,
        reason_code=reason_code,
        note=note,
        now=datetime.now(timezone.utc),
    )
    await db.flush()
    return entry
