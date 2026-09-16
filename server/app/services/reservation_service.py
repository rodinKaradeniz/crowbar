import hashlib
import json
import logging
from collections.abc import Sequence
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.reservation import Reservation
from app.models.business import Business
from app.models.reservation_delivery_attempt import ReservationDeliveryAttempt
from app.models.booking_schedule import BookingSchedule
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
from app.config import settings
from app.core.errors import ErrorCode
from app.core.regional import RegionalValidationError, normalize_phone
from app.services import email_service
from app.services.reservation_guest_token_service import issue_guest_token
from app.services.customer_identity_service import upsert_customer
from app.services.customer_service import record_public_marketing_consents

logger = logging.getLogger(__name__)


class ReservationIdempotencyConflict(ValueError):
    """A public reservation key was reused with different request data."""


def _public_request_fingerprint(data: PublicReservationCreate) -> str:
    payload = {
        "business_id": str(data.business_id),
        "service_type_id": str(data.service_type_id),
        "time": data.time.isoformat(),
        "phone": data.phone,
        "email": str(data.email).strip().casefold(),
        "name": data.name.strip(),
        "note": data.note,
        "guests": data.guests,
        "marketing_email_opt_in": data.marketing_email_opt_in,
        "marketing_sms_opt_in": data.marketing_sms_opt_in,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
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
    business = await db.get(Business, business_id)
    if business is None:
        raise AvailabilityError(status_code=404, code=ErrorCode.NOT_FOUND, message="Business not found")
    try:
        normalized_phone = normalize_phone(data.phone, business.country_code)
    except RegionalValidationError as exc:
        raise AvailabilityError(status_code=422, code=ErrorCode.VALIDATION_ERROR, message=str(exc)) from exc
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
        phone=normalized_phone,
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
        phone=normalized_phone,
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
    actor: User | None = None,
) -> Reservation:
    update_data = data.model_dump(exclude_unset=True)
    if update_data.get("phone") is not None:
        business = await db.get(Business, reservation.business_id)
        if business is None:
            raise AvailabilityError(status_code=404, code=ErrorCode.NOT_FOUND, message="Business not found")
        try:
            update_data["phone"] = normalize_phone(update_data["phone"], business.country_code)
        except RegionalValidationError as exc:
            raise AvailabilityError(status_code=422, code=ErrorCode.VALIDATION_ERROR, message=str(exc)) from exc
    if update_data.get("status") == "cancelled" and reservation.status != "cancelled":
        await cancel_reservation(
            db,
            reservation=reservation,
            actor_kind="staff",
            now=datetime.now(timezone.utc),
        )
        update_data.pop("status")
    if (
        reservation.status in {"cancelled", "completed", "no_show"}
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


#: What counts as a late cancellation when a venue has no booking schedule at
#: all. Read by both the enforcement in `cancel_reservation` and the value the
#: guest is shown before they cancel — one constant, because a guest told a
#: different number than the one enforced is worse than showing none.
DEFAULT_CANCELLATION_WINDOW_MINUTES = 120

#: Same, for whether the venue asks a guest to reconfirm. `BookingSchedule`
#: declares the column `NOT NULL DEFAULT TRUE`, so a venue with no schedule row
#: behaves as though it asks — matching `reconfirm_reservation`, which only
#: refuses when a policy exists and has it switched off.
DEFAULT_RECONFIRMATION_ENABLED = True


async def get_reservation_policy(
    db: AsyncSession, *, reservation: Reservation
) -> BookingSchedule | None:
    """Return the complete service override or business default policy."""
    policy = await db.scalar(
        select(BookingSchedule).where(
            BookingSchedule.business_id == reservation.business_id,
            BookingSchedule.service_type_id == reservation.service_type_id,
        )
    )
    if policy is None:
        policy = await db.scalar(
            select(BookingSchedule).where(
                BookingSchedule.business_id == reservation.business_id,
                BookingSchedule.service_type_id.is_(None),
            )
        )
    return policy


async def cancel_reservation(
    db: AsyncSession,
    *,
    reservation: Reservation,
    actor_kind: str,
    now: datetime | None = None,
) -> Reservation:
    if reservation.status not in {"pending", "confirmed"}:
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.RESERVATION_NOT_RESCHEDULABLE,
            message="Only active reservations can be cancelled",
        )
    current_time = now or datetime.now(timezone.utc)
    policy = await get_reservation_policy(db, reservation=reservation)
    window = (
        policy.cancellation_window_minutes
        if policy
        else DEFAULT_CANCELLATION_WINDOW_MINUTES
    )
    reservation.status = "cancelled"
    reservation.cancelled_at = current_time
    reservation.cancelled_by = actor_kind
    reservation.cancelled_late = reservation.time - current_time < timedelta(minutes=window)
    reservation.guest_token_revision += 1
    await db.flush()
    await db.refresh(reservation)
    return reservation


async def mark_reservation_no_show(
    db: AsyncSession,
    *,
    reservation: Reservation,
    actor: User,
    note: str | None,
    now: datetime | None = None,
) -> Reservation:
    if reservation.status not in {"pending", "confirmed"}:
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.RESERVATION_NOT_RESCHEDULABLE,
            message="Only active reservations can be marked as no-show",
        )
    current_time = now or datetime.now(timezone.utc)
    policy = await get_reservation_policy(db, reservation=reservation)
    grace = policy.arrival_grace_period_minutes if policy else 15
    if current_time < reservation.time + timedelta(minutes=grace):
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.CONFLICT,
            message="The arrival grace period has not ended",
        )
    reservation.status = "no_show"
    reservation.no_show_at = current_time
    reservation.no_show_by = actor.id
    reservation.no_show_note = note.strip() if note else None
    reservation.guest_token_revision += 1
    await db.flush()
    await db.refresh(reservation)
    return reservation


async def reconfirm_reservation(
    db: AsyncSession, *, reservation: Reservation, now: datetime | None = None
) -> Reservation:
    if reservation.status not in {"pending", "confirmed"} or reservation.time <= (now or datetime.now(timezone.utc)):
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.RESERVATION_NOT_RESCHEDULABLE,
            message="This reservation can no longer be reconfirmed",
        )
    policy = await get_reservation_policy(db, reservation=reservation)
    if policy is not None and not policy.reconfirmation_enabled:
        raise AvailabilityError(
            status_code=409,
            code=ErrorCode.CONFLICT,
            message="This venue does not request reconfirmation",
        )
    reservation.reconfirmed_at = now or datetime.now(timezone.utc)
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
    await db.execute(
        delete(ReservationDeliveryAttempt).where(
            ReservationDeliveryAttempt.reservation_id == reservation.id,
            ReservationDeliveryAttempt.message_kind == "reminder",
        )
    )
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
    business = await db.get(Business, data.business_id)
    if business is None:
        raise AvailabilityError(status_code=404, code=ErrorCode.NOT_FOUND, message="Business not found")
    try:
        normalized_phone = normalize_phone(data.phone, business.country_code)
    except RegionalValidationError as exc:
        raise AvailabilityError(status_code=422, code=ErrorCode.VALIDATION_ERROR, message=str(exc)) from exc
    data = data.model_copy(update={"phone": normalized_phone})
    fingerprint = _public_request_fingerprint(data)
    lock_key = f"reservation:{data.business_id}:{data.idempotency_key}"
    await db.execute(
        select(
            func.pg_advisory_xact_lock(func.hashtextextended(lock_key, 0))
        )
    )
    existing = await db.scalar(
        select(Reservation).where(
            Reservation.business_id == data.business_id,
            Reservation.idempotency_key == data.idempotency_key,
        )
    )
    if existing is not None:
        if existing.request_fingerprint != fingerprint:
            raise ReservationIdempotencyConflict(
                "This idempotency key was already used for a different reservation"
            )
        existing._idempotent_created = False
        return existing

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
        idempotency_key=data.idempotency_key,
        request_fingerprint=fingerprint,
    )
    db.add(reservation)
    await db.flush()
    await record_public_marketing_consents(
        db,
        customer_id=customer.id,
        business_id=data.business_id,
        reservation_id=reservation.id,
        email_opt_in=data.marketing_email_opt_in,
        sms_opt_in=data.marketing_sms_opt_in,
    )
    await _apply_automatic_table_assignment(
        db,
        reservation=reservation,
        table_ids=validated_slot.table_ids,
        actor_id=None,
    )
    reservation._idempotent_created = True
    return reservation


async def record_confirmation_delivery(
    db: AsyncSession,
    *,
    business_id: UUID,
    reservation_id: UUID,
    channel: str,
    message_kind: str,
    delivered: bool,
    error: str | None = None,
) -> ReservationDeliveryAttempt:
    """Persist the outcome of a reservation confirmation send.

    THE ONLY GUEST-FACING MESSAGE THAT LEFT NO TRACE. Queue "table ready",
    waitlist offers and the reminder job each write a `DeliveryAttempt` with a
    `last_error` an operator can see; the confirmation path returned 201, the
    row was correct, no email went out, and the only evidence anywhere was a
    `logger.debug` in `email_service`. An operator had no way to know a guest
    was never told.

    Same shape as `reservation_reminders` and `deliver_waitlist_offer`:
    create-if-missing, increment the counter, then a terminal status. The row is
    keyed by `(reservation_id, message_kind, channel)` — the partial unique
    index `uq_delivery_attempt_reservation_message_channel` — so a resend or a
    staff confirmation after a pending booking updates the existing row rather
    than accumulating one per attempt. `with_for_update` because a resend and
    the reminder batch can touch the same reservation.
    """
    attempt = await db.scalar(
        select(ReservationDeliveryAttempt)
        .where(
            ReservationDeliveryAttempt.reservation_id == reservation_id,
            ReservationDeliveryAttempt.message_kind == message_kind,
            ReservationDeliveryAttempt.channel == channel,
        )
        .with_for_update()
    )
    if attempt is None:
        attempt = ReservationDeliveryAttempt(
            business_id=business_id,
            reservation_id=reservation_id,
            message_kind=message_kind,
            channel=channel,
            status="pending",
        )
        db.add(attempt)

    attempt.attempt_count = (attempt.attempt_count or 0) + 1
    attempt.last_attempt_at = datetime.now(timezone.utc)

    if delivered:
        attempt.status = "delivered"
        attempt.delivered_at = datetime.now(timezone.utc)
        attempt.last_error = None
    else:
        attempt.status = "failed"
        attempt.delivered_at = None
        attempt.last_error = error or email_service.failure_reason()

    await db.flush()
    return attempt


#: The two message kinds that ARE the guest's confirmation. `reminder` is a
#: separate message with its own attempt row and its own job; folding it in here
#: would let a failed reminder read as a failed confirmation on the staff board.
CONFIRMATION_MESSAGE_KINDS = ("created", "rescheduled")


async def confirmation_delivery_states(
    db: AsyncSession, *, business_id: UUID, reservation_ids: Sequence[UUID]
) -> dict[UUID, str]:
    """Collapse each booking's confirmation attempts to one operator-readable word.

    Returns the same vocabulary the queue and waitlist already use — `delivered`,
    `pending`, `failed`, `unavailable` — so one `deliverySeverity` on the client
    reads all three surfaces. `unavailable` means no attempt row exists at all:
    a booking with no email address, or one whose confirmation has not been
    attempted yet.

    LATEST ATTEMPT WINS, which is deliberately NOT the rule
    `reservation_waitlist_service.delivery_state` uses. An offer is one message
    over two channels, so any-delivered is the truth there. A reservation has two
    DIFFERENT messages: a delivered `created` says nothing about whether the
    `rescheduled` mail landed, and an any-delivered ladder would hide exactly
    the failure an operator needs to see. Copied rather than shared for that
    reason — the shape is the same, the rule is not.

    One query for the whole board rather than the waitlist list's per-row call:
    `get_reservations_by_business` has no date bound, so this runs over every
    confirmed booking the venue has.
    """
    ids = list(reservation_ids)
    states: dict[UUID, str] = {reservation_id: "unavailable" for reservation_id in ids}
    if not ids:
        return states

    rows = await db.scalars(
        select(ReservationDeliveryAttempt)
        .where(
            ReservationDeliveryAttempt.business_id == business_id,
            ReservationDeliveryAttempt.reservation_id.in_(ids),
            ReservationDeliveryAttempt.message_kind.in_(CONFIRMATION_MESSAGE_KINDS),
        )
        .order_by(
            ReservationDeliveryAttempt.reservation_id,
            ReservationDeliveryAttempt.last_attempt_at.asc().nulls_first(),
        )
    )
    for attempt in rows:
        states[attempt.reservation_id] = attempt.status
    return states


async def resend_confirmation(
    db: AsyncSession, *, reservation: Reservation
) -> ReservationDeliveryAttempt | None:
    """Send the guest's confirmation again and record the outcome.

    Returns `None` when there is nothing that could be sent — no email address,
    or a booking that is no longer live — so the caller can answer 409 rather
    than pretend it tried.

    Lives here, not in the router, because `deliver_waitlist_offer` sets the
    precedent: the sibling channel owns its own send and its own attempt row in
    its service. The confirmation's ORIGINAL send is the outlier, and only
    because it has to run as a `BackgroundTasks` entry point on its own session
    after the response; nothing about a staff resend needs that.

    Synchronous on the request session, again like the waitlist retry: a staff
    member pressed "Send again" and the response IS the evidence. Backgrounding
    it would hand back the state they already saw and invite a second press.

    Resends the message kind that was last attempted rather than always
    `created`. A venue that reschedules a booking and whose reschedule mail
    fails would otherwise resend the original confirmation forever, leaving the
    failed row failed and the board marked.
    """
    if not reservation.email:
        return None
    if reservation.status not in ("pending", "confirmed"):
        return None

    last_attempt = await db.scalar(
        select(ReservationDeliveryAttempt)
        .where(
            ReservationDeliveryAttempt.reservation_id == reservation.id,
            ReservationDeliveryAttempt.message_kind.in_(CONFIRMATION_MESSAGE_KINDS),
        )
        .order_by(ReservationDeliveryAttempt.last_attempt_at.desc().nulls_last())
        .limit(1)
    )
    message_kind = last_attempt.message_kind if last_attempt else "created"

    business = reservation.business
    delivered = False
    error: str | None = None
    try:
        delivered = email_service.send_reservation_confirmation(
            to_email=reservation.email,
            customer_name=(
                (reservation.customer.name if reservation.customer else None)
                or reservation.phone
                or ""
            ),
            business_name=business.name if business else "",
            service_type_name=(
                reservation.service_type.name if reservation.service_type else ""
            ),
            reservation_time=reservation.time,
            duration_minutes=max(
                int((reservation.ends_at - reservation.time).total_seconds() // 60), 1
            ),
            guests=reservation.guests,
            status=reservation.status,
            reservation_id=str(reservation.id),
            business_timezone=business.timezone if business else "UTC",
            calendar_sequence=int(reservation.updated_at.timestamp()),
            message_kind=message_kind,
            management_url=(
                f"{settings.frontend_url}/reserve/manage#token="
                + issue_guest_token(
                    business_id=reservation.business_id,
                    reservation_id=reservation.id,
                    revision=reservation.guest_token_revision,
                )
            ),
        )
    except Exception as exc:  # noqa: BLE001 - recorded, never raised at the operator
        error = f"Email provider raised: {type(exc).__name__}"
        logger.exception(
            "reservation confirmation resend failed reservation_id=%s", reservation.id
        )

    return await record_confirmation_delivery(
        db,
        business_id=reservation.business_id,
        reservation_id=reservation.id,
        channel="email",
        message_kind=message_kind,
        delivered=delivered,
        error=error,
    )
