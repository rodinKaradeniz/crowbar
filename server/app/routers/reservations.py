from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode, api_error, forbidden, not_found
from app.core.rate_limit import (
    PUBLIC_IDENTITY_WRITE_LIMIT,
    PUBLIC_WRITE_IP_LIMIT,
    RateLimitCheck,
    enforce_rate_limits,
    get_client_ip,
)
from app.database import get_db
from app.dependencies import (
    get_current_business,
    get_current_user,
    require_module,
    require_roles,
)
from app.models.business import Business
from app.models.user import User
from app.schemas.reservation import (
    PublicReservationCreate,
    PublicReservationManagementReschedule,
    ReservationCreate,
    ReservationNoShow,
    ReservationReschedule,
    ReservationResponse,
    ReservationUpdate,
)
from app.schemas.reservation_waitlist import (
    ReservationWaitlistCreate,
    ReservationWaitlistOffer,
    ReservationWaitlistResponse,
)
from app.schemas.booking_schedule import AvailabilityResponse
from app.services import email_service
from app.services import reservation_service
from app.services import reservation_waitlist_service
from app.services.availability_service import (
    AvailabilityError,
    get_availability,
    get_override_times,
)
from app.services.reservation_notifications import (
    ReservationSnapshot,
    notify_after_reservation_create,
    notify_after_reservation_delete,
    notify_after_reservation_patch,
    notify_after_reservation_reschedule,
    send_reschedule_sms,
)
from app.core.events import DomainEvent, publish
from app.config import settings
from app.services.reservation_guest_token_service import (
    ReservationGuestTokenError,
    issue_guest_token,
    parse_guest_token,
)
from app.services.reservation_waitlist_token_service import (
    WaitlistOfferTokenError,
    issue_offer_token,
    parse_offer_token,
)
from app.models.reservation_waitlist import ReservationWaitlistEntry

router = APIRouter(prefix="/api/reservations", tags=["reservations"])


def _availability_http_error(exc: AvailabilityError):
    return api_error(
        exc.status_code,
        exc.code,
        exc.message,
        exc.details,
    )


def _send_reservation_email(
    *,
    to_email: str,
    customer_name: str,
    business_name: str,
    service_type_name: str,
    reservation_time,
    duration_minutes: int | None,
    guests: int,
    status: str,
    reservation_id: str,
    business_timezone: str,
    calendar_sequence: int,
    message_kind: str = "created",
    management_url: str | None = None,
) -> None:
    email_service.send_reservation_confirmation(
        to_email=to_email,
        customer_name=customer_name,
        business_name=business_name,
        service_type_name=service_type_name,
        reservation_time=reservation_time,
        duration_minutes=duration_minutes,
        guests=guests,
        status=status,
        reservation_id=reservation_id,
        business_timezone=business_timezone,
        calendar_sequence=calendar_sequence,
        message_kind=message_kind,
        management_url=management_url,
    )


def _reservation_management_url(reservation) -> str:
    token = issue_guest_token(
        business_id=reservation.business_id,
        reservation_id=reservation.id,
        revision=reservation.guest_token_revision,
    )
    return f"{settings.frontend_url}/reserve/manage/{token}"


async def _get_guest_reservation(db: AsyncSession, token: str, *, for_update: bool = False):
    try:
        business_id, reservation_id, revision = parse_guest_token(token)
    except ReservationGuestTokenError as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, ErrorCode.NOT_FOUND, str(exc)) from exc
    reservation = await reservation_service.get_reservation_by_id(
        db, reservation_id, business_id=business_id, load_relations=True, for_update=for_update
    )
    if reservation is None or reservation.guest_token_revision != revision:
        raise api_error(status.HTTP_404_NOT_FOUND, ErrorCode.NOT_FOUND, "This reservation link is no longer valid")
    if "reservations" not in (reservation.business.enabled_modules or []):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            ErrorCode.MODULE_DISABLED,
            "The reservations module is not enabled for this business",
            {"module": "reservations"},
        )
    return reservation


def _reservation_duration_minutes(reservation) -> int:
    return max(
        int((reservation.ends_at - reservation.time).total_seconds() // 60),
        1,
    )


def _can_override_availability(user: User, business_id: UUID) -> bool:
    return any(
        assignment.business_id == business_id
        and assignment.role in {"owner", "manager"}
        for assignment in user.staff_assignments
    )


@router.get("/business/{business_id}", response_model=list[ReservationResponse])
async def list_business_reservations(
    business_id: UUID,
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    """List reservations for the authenticated user's business."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    return await reservation_service.get_reservations_by_business(
        db, business_id, status=status_filter
    )


@router.get("/availability", response_model=AvailabilityResponse)
async def get_staff_reservation_availability(
    service_type_id: UUID = Query(...),
    start_date: date = Query(...),
    days: int = Query(default=1, ge=1, le=31),
    guests: int = Query(default=1, ge=1),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    try:
        return await get_availability(
            db,
            business_id=business.id,
            service_type_id=service_type_id,
            start_date=start_date,
            days=days,
            guests=guests,
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc


@router.get("/override-times", response_model=AvailabilityResponse)
async def get_staff_override_times(
    service_type_id: UUID = Query(...),
    local_date: date = Query(...),
    guests: int = Query(default=1, ge=1),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
    __: User = Depends(require_roles("owner", "manager")),
):
    try:
        return await get_override_times(
            db,
            business_id=business.id,
            service_type_id=service_type_id,
            local_date=local_date,
            guests=guests,
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc


@router.get("/{reservation_id}", response_model=ReservationResponse)
async def get_reservation(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    reservation = await reservation_service.get_reservation_by_id(
        db,
        reservation_id,
        business_id=current_business.id,
    )
    if reservation is None:
        raise not_found("Reservation")
    return reservation


@router.post("/public", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
async def create_public_reservation(
    data: PublicReservationCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Create a reservation from the public booking form (no auth required)."""
    client_ip = get_client_ip(request)
    await enforce_rate_limits(
        RateLimitCheck(
            policy=PUBLIC_WRITE_IP_LIMIT,
            key_parts=("reservation", str(data.business_id), client_ip),
        ),
        RateLimitCheck(
            policy=PUBLIC_IDENTITY_WRITE_LIMIT,
            key_parts=("reservation", str(data.business_id), data.phone),
        ),
    )

    try:
        reservation = await reservation_service.create_public_reservation(db, data)
    except reservation_service.ReservationIdempotencyConflict as exc:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "IDEMPOTENCY_CONFLICT",
            str(exc),
        ) from exc
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    created = getattr(reservation, "_idempotent_created", True)
    await db.refresh(reservation, ["business", "service_type", "customer"])
    if created:
        await notify_after_reservation_create(
            db, reservation, customer_display_name=data.name
        )
    await db.commit()
    if created:
        background_tasks.add_task(
            _send_reservation_email,
            to_email=reservation.email,
            customer_name=data.name,
            business_name=reservation.business.name if reservation.business else "",
            service_type_name=reservation.service_type.name if reservation.service_type else "",
            reservation_time=reservation.time,
            duration_minutes=_reservation_duration_minutes(reservation),
            guests=reservation.guests,
            status=reservation.status,
            reservation_id=str(reservation.id),
            business_timezone=reservation.business.timezone if reservation.business else "UTC",
            calendar_sequence=int(reservation.updated_at.timestamp()),
            management_url=_reservation_management_url(reservation),
        )
        await publish(DomainEvent(
            event_type="reservation.created",
            business_id=str(reservation.business_id),
            payload={
                "reservation_id": str(reservation.id),
                "customer_id": str(reservation.customer_id),
                "service_type_id": str(reservation.service_type_id),
                "status": reservation.status,
                "time": reservation.time.isoformat(),
                "ends_at": reservation.ends_at.isoformat(),
                "source": "public",
            },
        ))
    return reservation


@router.get("/public/manage/{guest_token}", response_model=ReservationResponse)
async def get_public_reservation_management(
    guest_token: str,
    db: AsyncSession = Depends(get_db),
):
    """A bearer link deliberately exposes only its own reservation."""
    return await _get_guest_reservation(db, guest_token)


@router.post("/public/manage/{guest_token}/cancel", response_model=ReservationResponse)
async def cancel_public_reservation(
    guest_token: str,
    db: AsyncSession = Depends(get_db),
):
    reservation = await _get_guest_reservation(db, guest_token, for_update=True)
    if reservation.time <= datetime.now(timezone.utc):
        raise api_error(
            status.HTTP_409_CONFLICT,
            ErrorCode.RESERVATION_NOT_RESCHEDULABLE,
            "Please contact the venue about a reservation that has already started",
        )
    try:
        reservation = await reservation_service.cancel_reservation(
            db, reservation=reservation, actor_kind="guest"
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await db.refresh(reservation)
    await publish(DomainEvent(
        event_type="reservation.cancelled",
        business_id=str(reservation.business_id),
        payload={"reservation_id": str(reservation.id), "source": "guest", "late": reservation.cancelled_late},
    ))
    return reservation


@router.post("/public/manage/{guest_token}/reconfirm", response_model=ReservationResponse)
async def reconfirm_public_reservation(
    guest_token: str,
    db: AsyncSession = Depends(get_db),
):
    reservation = await _get_guest_reservation(db, guest_token, for_update=True)
    try:
        reservation = await reservation_service.reconfirm_reservation(db, reservation=reservation)
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await publish(DomainEvent(
        event_type="reservation.reconfirmed",
        business_id=str(reservation.business_id),
        payload={"reservation_id": str(reservation.id), "source": "guest"},
    ))
    return reservation


@router.post("/public/manage/{guest_token}/reschedule", response_model=ReservationResponse)
async def reschedule_public_reservation(
    guest_token: str,
    data: PublicReservationManagementReschedule,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    reservation = await _get_guest_reservation(db, guest_token, for_update=True)
    if reservation.time <= datetime.now(timezone.utc):
        raise api_error(
            status.HTTP_409_CONFLICT,
            ErrorCode.RESERVATION_NOT_RESCHEDULABLE,
            "Please contact the venue about a reservation that has already started",
        )
    old_snapshot = ReservationSnapshot.from_model(reservation)
    try:
        reservation = await reservation_service.reschedule_reservation(
            db,
            reservation=reservation,
            data=ReservationReschedule(
                service_type_id=data.service_type_id, time=data.time, guests=data.guests
            ),
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.refresh(reservation, ["business", "service_type", "customer"])
    await db.commit()
    background_tasks.add_task(
        _send_reservation_email,
        to_email=reservation.email,
        customer_name=reservation.customer.name if reservation.customer else "",
        business_name=reservation.business.name if reservation.business else "",
        service_type_name=reservation.service_type.name if reservation.service_type else "",
        reservation_time=reservation.time,
        duration_minutes=_reservation_duration_minutes(reservation),
        guests=reservation.guests,
        status=reservation.status,
        reservation_id=str(reservation.id),
        business_timezone=reservation.business.timezone if reservation.business else "UTC",
        calendar_sequence=int(reservation.updated_at.timestamp()),
        message_kind="rescheduled",
        management_url=_reservation_management_url(reservation),
    )
    await publish(DomainEvent(
        event_type="reservation.rescheduled",
        business_id=str(reservation.business_id),
        payload={"reservation_id": str(reservation.id), "source": "guest", "old_time": old_snapshot.time.isoformat()},
    ))
    return reservation


@router.post("/waitlist/public", response_model=ReservationWaitlistResponse, status_code=status.HTTP_201_CREATED)
async def create_public_waitlist_entry(
    data: ReservationWaitlistCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = get_client_ip(request)
    await enforce_rate_limits(
        RateLimitCheck(policy=PUBLIC_WRITE_IP_LIMIT, key_parts=("waitlist", str(data.business_id), client_ip)),
        RateLimitCheck(policy=PUBLIC_IDENTITY_WRITE_LIMIT, key_parts=("waitlist", str(data.business_id), data.phone)),
    )
    try:
        entry = await reservation_waitlist_service.create_waitlist_entry(db, data=data)
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("/waitlist", response_model=list[ReservationWaitlistResponse])
async def list_reservation_waitlist(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    return await reservation_waitlist_service.list_waitlist_entries(db, business_id=business.id)


@router.post("/waitlist", response_model=ReservationWaitlistResponse, status_code=status.HTTP_201_CREATED)
async def create_staff_waitlist_entry(
    data: ReservationWaitlistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    data = data.model_copy(update={"business_id": business.id})
    try:
        entry = await reservation_waitlist_service.create_waitlist_entry(
            db, data=data, actor=current_user, public=False
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/waitlist/{entry_id}/offer", response_model=ReservationWaitlistResponse)
async def offer_reservation_waitlist_entry(
    entry_id: UUID,
    data: ReservationWaitlistOffer,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    try:
        entry = await reservation_waitlist_service.offer_waitlist_entry(
            db, business_id=business.id, entry_id=entry_id, reservation_time=data.reservation_time
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    from app.models.customer import Customer
    customer = await db.get(Customer, entry.customer_id)
    await db.commit()
    await db.refresh(entry)
    if customer and customer.email:
        token = issue_offer_token(
            business_id=entry.business_id, entry_id=entry.id, revision=entry.offer_token_revision
        )
        background_tasks.add_task(
            email_service.send_waitlist_offer,
            to_email=customer.email,
            business_name=business.name,
            offer_url=f"{settings.frontend_url}/reserve/waitlist/{token}",
        )
    return entry


@router.post("/waitlist/offers/{offer_token}/accept", response_model=ReservationResponse)
async def accept_public_waitlist_offer(
    offer_token: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        business_id, entry_id, revision = parse_offer_token(offer_token)
    except WaitlistOfferTokenError as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, ErrorCode.NOT_FOUND, str(exc)) from exc
    business = await db.get(Business, business_id)
    if business is None or "reservations" not in (business.enabled_modules or []):
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            ErrorCode.NOT_FOUND,
            "This waitlist offer is no longer valid",
        )
    entry = await db.scalar(
        select(ReservationWaitlistEntry).where(
            ReservationWaitlistEntry.id == entry_id,
            ReservationWaitlistEntry.business_id == business_id,
            ReservationWaitlistEntry.offer_token_revision == revision,
        ).with_for_update()
    )
    if entry is None:
        raise api_error(status.HTTP_404_NOT_FOUND, ErrorCode.NOT_FOUND, "This waitlist offer is no longer valid")
    try:
        reservation = await reservation_waitlist_service.accept_waitlist_offer(db, entry=entry)
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await db.refresh(reservation)
    await publish(DomainEvent(
        event_type="reservation.created",
        business_id=str(reservation.business_id),
        payload={"reservation_id": str(reservation.id), "source": "waitlist"},
    ))
    return reservation


@router.post("", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
async def create_reservation(
    data: ReservationCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    try:
        reservation = await reservation_service.create_reservation(
            db,
            business_id=business.id,
            data=data,
            override_actor=(
                current_user
                if _can_override_availability(current_user, business.id)
                else None
            ),
            actor=current_user,
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.refresh(reservation, ["business", "service_type", "customer"])
    display_name = (reservation.customer.name if reservation.customer else None) or reservation.phone
    await notify_after_reservation_create(
        db,
        reservation,
        customer_display_name=display_name,
        actor=current_user,
    )
    await db.commit()
    background_tasks.add_task(
        _send_reservation_email,
        to_email=reservation.email,
        customer_name=display_name,
        business_name=reservation.business.name if reservation.business else "",
        service_type_name=reservation.service_type.name if reservation.service_type else "",
        reservation_time=reservation.time,
        duration_minutes=_reservation_duration_minutes(reservation),
        guests=reservation.guests,
        status=reservation.status,
        reservation_id=str(reservation.id),
        business_timezone=reservation.business.timezone if reservation.business else "UTC",
        calendar_sequence=int(reservation.updated_at.timestamp()),
        management_url=_reservation_management_url(reservation),
    )
    await publish(DomainEvent(
        event_type="reservation.created",
        business_id=str(reservation.business_id),
        payload={
            "reservation_id": str(reservation.id),
            "customer_id": str(reservation.customer_id),
            "service_type_id": str(reservation.service_type_id),
            "status": reservation.status,
            "time": reservation.time.isoformat(),
            "ends_at": reservation.ends_at.isoformat(),
            "source": "authenticated",
            "availability_overridden": bool(
                reservation.availability_override_reason
            ),
            "actor_user_id": str(current_user.id),
        },
    ))
    return reservation


@router.get(
    "/{reservation_id}/availability",
    response_model=AvailabilityResponse,
)
async def get_reschedule_availability(
    reservation_id: UUID,
    service_type_id: UUID = Query(...),
    start_date: date = Query(...),
    days: int = Query(default=1, ge=1, le=31),
    guests: int = Query(default=1, ge=1),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    reservation = await reservation_service.get_reservation_by_id(
        db,
        reservation_id,
        business_id=business.id,
    )
    if reservation is None:
        raise not_found("Reservation")
    try:
        return await reservation_service.get_reschedule_availability(
            db,
            reservation=reservation,
            service_type_id=service_type_id,
            start_date=start_date,
            days=days,
            guests=guests,
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc


@router.post(
    "/{reservation_id}/reschedule",
    response_model=ReservationResponse,
)
async def reschedule_reservation(
    reservation_id: UUID,
    data: ReservationReschedule,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    reservation = await reservation_service.get_reservation_by_id(
        db,
        reservation_id,
        business_id=business.id,
        load_relations=True,
        for_update=True,
    )
    if reservation is None:
        raise not_found("Reservation")

    old_snapshot = ReservationSnapshot.from_model(reservation)
    try:
        reservation = await reservation_service.reschedule_reservation(
            db,
            reservation=reservation,
            data=data,
            override_actor=(
                current_user
                if _can_override_availability(current_user, business.id)
                else None
            ),
            actor=current_user,
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc

    await db.refresh(reservation, ["business", "service_type", "customer"])
    await notify_after_reservation_reschedule(
        db,
        old=old_snapshot,
        new=reservation,
        actor=current_user,
    )
    await db.commit()

    customer_name = (
        reservation.customer.name if reservation.customer else None
    ) or reservation.phone
    business_name = reservation.business.name if reservation.business else ""
    business_timezone = (
        reservation.business.timezone if reservation.business else "UTC"
    )
    background_tasks.add_task(
        _send_reservation_email,
        to_email=reservation.email,
        customer_name=customer_name,
        business_name=business_name,
        service_type_name=(
            reservation.service_type.name if reservation.service_type else ""
        ),
        reservation_time=reservation.time,
        duration_minutes=_reservation_duration_minutes(reservation),
        guests=reservation.guests,
        status=reservation.status,
        reservation_id=str(reservation.id),
        business_timezone=business_timezone,
        calendar_sequence=int(reservation.updated_at.timestamp()),
        message_kind="rescheduled",
    )
    background_tasks.add_task(
        send_reschedule_sms,
        notification_channels=(
            reservation.business.notification_channels
            if reservation.business
            else []
        ),
        phone=reservation.phone,
        business_name=business_name,
        reservation_time=reservation.time,
        timezone_name=business_timezone,
    )
    await publish(
        DomainEvent(
            event_type="reservation.rescheduled",
            business_id=str(reservation.business_id),
            payload={
                "reservation_id": str(reservation.id),
                "old_service_type_id": str(old_snapshot.service_type_id),
                "new_service_type_id": str(reservation.service_type_id),
                "old_time": old_snapshot.time.isoformat(),
                "new_time": reservation.time.isoformat(),
                "old_guests": old_snapshot.guests,
                "new_guests": reservation.guests,
                "actor_user_id": str(current_user.id),
                "availability_overridden": bool(
                    reservation.availability_override_reason
                ),
            },
        )
    )
    return reservation


@router.patch("/{reservation_id}", response_model=ReservationResponse)
async def update_reservation(
    reservation_id: UUID,
    data: ReservationUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    old_reservation = await reservation_service.get_reservation_by_id(
        db,
        reservation_id,
        business_id=business.id,
        load_relations=True,
        for_update=True,
    )
    if old_reservation is None:
        raise not_found("Reservation")

    old_snap = ReservationSnapshot.from_model(old_reservation)
    try:
        reservation = await reservation_service.update_reservation(
            db,
            reservation=old_reservation,
            data=data,
            actor=current_user,
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    send_confirmation = data.status == "confirmed" and old_snap.status == "pending"

    if send_confirmation:
        await db.refresh(reservation, ["business", "service_type", "customer"])
        background_tasks.add_task(
            _send_reservation_email,
            to_email=reservation.email,
            customer_name=reservation.customer.name if reservation.customer else "",
            business_name=reservation.business.name if reservation.business else "",
            service_type_name=reservation.service_type.name if reservation.service_type else "",
            reservation_time=reservation.time,
            duration_minutes=_reservation_duration_minutes(reservation),
            guests=reservation.guests,
            status="confirmed",
            reservation_id=str(reservation.id),
            business_timezone=(
                reservation.business.timezone if reservation.business else "UTC"
            ),
            calendar_sequence=int(reservation.updated_at.timestamp()),
        )

    await notify_after_reservation_patch(
        db, old=old_snap, new=reservation, data=data, actor=current_user
    )
    await db.commit()
    await publish(DomainEvent(
        event_type="reservation.updated",
        business_id=str(old_reservation.business_id),
        payload={
            "reservation_id": str(reservation_id),
            "old_status": old_snap.status,
            "new_status": data.status or old_snap.status,
        },
    ))
    return reservation


@router.post("/{reservation_id}/no-show", response_model=ReservationResponse)
async def mark_reservation_no_show(
    reservation_id: UUID,
    data: ReservationNoShow,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    reservation = await reservation_service.get_reservation_by_id(
        db, reservation_id, business_id=business.id, for_update=True
    )
    if reservation is None:
        raise not_found("Reservation")
    try:
        reservation = await reservation_service.mark_reservation_no_show(
            db, reservation=reservation, actor=current_user, note=data.note
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await publish(DomainEvent(
        event_type="reservation.no_show",
        business_id=str(reservation.business_id),
        payload={"reservation_id": str(reservation.id), "actor_user_id": str(current_user.id)},
    ))
    return reservation


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reservation(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    reservation = await reservation_service.get_reservation_by_id(
        db,
        reservation_id,
        business_id=business.id,
        load_relations=True,
        for_update=True,
    )
    if reservation is None:
        raise not_found("Reservation")

    await notify_after_reservation_delete(db, reservation, actor=current_user)
    await reservation_service.delete_reservation(
        db,
        reservation=reservation,
    )
    await db.commit()
    await publish(DomainEvent(
        event_type="reservation.deleted",
        business_id=str(reservation.business_id),
        payload={"reservation_id": str(reservation_id)},
    ))
