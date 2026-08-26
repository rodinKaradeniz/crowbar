from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode, api_error, forbidden, not_found
from app.core.permissions import has_capability
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
    require_capability,
    require_module,
)
from app.models.business import Business
from app.models.user import User
from app.schemas.reservation import (
    PublicReservationCreate,
    PublicReservationManagementReschedule,
    PublicReservationResponse,
    ReservationCreate,
    ReservationNoShow,
    ReservationReschedule,
    ReservationResponse,
    ReservationUpdate,
)
from app.schemas.reservation_waitlist import (
    ReservationWaitlistCreate,
    ReservationWaitlistOffer,
    PublicReservationWaitlistResponse,
    ReservationWaitlistResponse,
    ReservationWaitlistTerminalCommand,
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
    issue_management_token,
    issue_offer_token,
    parse_management_token,
    parse_offer_token,
)
from app.models.reservation_waitlist import ReservationWaitlistEntry
from app.services.public_session_service import (
    clear_public_cookie,
    get_public_cookie,
    set_public_cookie,
)

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
    to_email: str | None,
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
    if not to_email:
        return
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
    return f"{settings.frontend_url}/reserve/manage#token={token}"


def _capability_cookie(request: Request, kind: str) -> str:
    token = get_public_cookie(request, kind=kind)
    if token is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            ErrorCode.NOT_FOUND,
            "This link is no longer valid",
        )
    return token


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
        and has_capability(assignment.role, "reservations.override")
        for assignment in user.staff_assignments
    )


@router.get("/business/{business_id}", response_model=list[ReservationResponse],
    dependencies=[Depends(require_capability("reservations.view"))],
)
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


@router.get("/availability", response_model=AvailabilityResponse,
    dependencies=[Depends(require_capability("reservations.view"))],
)
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


@router.get("/override-times", response_model=AvailabilityResponse,
    dependencies=[Depends(require_capability("reservations.override"))],
)
async def get_staff_override_times(
    service_type_id: UUID = Query(...),
    local_date: date = Query(...),
    guests: int = Query(default=1, ge=1),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
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


@router.get("/waitlist", response_model=list[ReservationWaitlistResponse],
    dependencies=[Depends(require_capability("reservations.view"))],
)
async def list_reservation_waitlist(
    view: str = Query(default="active", pattern="^(active|history)$"),
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    # This static path must be registered before /{reservation_id}; otherwise
    # FastAPI attempts to parse the word "waitlist" as a UUID and returns 422.
    entries = await reservation_waitlist_service.list_waitlist_entries(
        db, business_id=business.id, view=view
    )
    await db.commit()
    return [await _waitlist_response(db, entry) for entry in entries]


@router.get("/{reservation_id}", response_model=ReservationResponse,
    dependencies=[Depends(require_capability("reservations.view"))],
)
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


@router.post("/public", response_model=PublicReservationResponse, status_code=status.HTTP_201_CREATED)
async def create_public_reservation(
    data: PublicReservationCreate,
    request: Request,
    response: Response,
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
    set_public_cookie(
        response,
        kind="reservation",
        token=issue_guest_token(
            business_id=reservation.business_id,
            reservation_id=reservation.id,
            revision=reservation.guest_token_revision,
        ),
    )
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


@router.get("/public/manage", response_model=PublicReservationResponse)
async def get_public_reservation_management(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """A bearer link deliberately exposes only its own reservation."""
    return await _get_guest_reservation(db, _capability_cookie(request, "reservation"))


@router.post("/public/manage/cancel", response_model=PublicReservationResponse)
async def cancel_public_reservation(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    reservation = await _get_guest_reservation(
        db, _capability_cookie(request, "reservation"), for_update=True
    )
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
    clear_public_cookie(response, kind="reservation")
    return reservation


@router.post("/public/manage/reconfirm", response_model=PublicReservationResponse)
async def reconfirm_public_reservation(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    reservation = await _get_guest_reservation(
        db, _capability_cookie(request, "reservation"), for_update=True
    )
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


@router.post("/public/manage/reschedule", response_model=PublicReservationResponse)
async def reschedule_public_reservation(
    request: Request,
    response: Response,
    data: PublicReservationManagementReschedule,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    reservation = await _get_guest_reservation(
        db, _capability_cookie(request, "reservation"), for_update=True
    )
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
    set_public_cookie(
        response,
        kind="reservation",
        token=issue_guest_token(
            business_id=reservation.business_id,
            reservation_id=reservation.id,
            revision=reservation.guest_token_revision,
        ),
    )
    return reservation


async def _waitlist_response(
    db: AsyncSession,
    entry: ReservationWaitlistEntry,
    *,
    include_management_token: bool = False,
) -> ReservationWaitlistResponse:
    # Several terminal commands commit before publishing and then return the
    # authoritative row. Refresh server-managed timestamps so async attribute
    # access never attempts implicit IO during Pydantic serialization.
    await db.refresh(entry)
    return ReservationWaitlistResponse.model_validate(entry).model_copy(
        update={
            "management_token": (
                issue_management_token(
                    business_id=entry.business_id,
                    entry_id=entry.id,
                    revision=entry.management_token_revision,
                )
                if include_management_token
                else None
            ),
            "delivery_state": await reservation_waitlist_service.delivery_state(
                db, business_id=entry.business_id, entry_id=entry.id
            ),
        }
    )


async def _public_waitlist_entry(
    db: AsyncSession,
    token: str,
    *,
    offer: bool,
    lock: bool = False,
) -> ReservationWaitlistEntry:
    try:
        business_id, entry_id, revision = (
            parse_offer_token(token) if offer else parse_management_token(token)
        )
    except WaitlistOfferTokenError as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, ErrorCode.NOT_FOUND, str(exc)) from exc
    query = select(ReservationWaitlistEntry).where(
        ReservationWaitlistEntry.id == entry_id,
        ReservationWaitlistEntry.business_id == business_id,
    )
    if lock:
        query = query.with_for_update()
    entry = await db.scalar(query)
    expected = entry.offer_token_revision if offer and entry else (
        entry.management_token_revision if entry else None
    )
    # A genuine signed link may continue to show a terminal outcome even after
    # the revision was advanced to prevent a second mutation.
    if entry is None or (
        revision != expected
        and entry.status not in reservation_waitlist_service.TERMINAL_STATUSES
    ):
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            ErrorCode.NOT_FOUND,
            "This waitlist link is no longer valid",
        )
    business = await db.get(Business, business_id)
    if business is None or "reservations" not in (business.enabled_modules or []):
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            ErrorCode.NOT_FOUND,
            "This waitlist link is no longer valid",
        )
    await reservation_waitlist_service.expire_entry_if_due(db, entry)
    return entry


@router.post(
    "/waitlist/public",
    response_model=PublicReservationWaitlistResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_public_waitlist_entry(
    data: ReservationWaitlistCreate,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    client_ip = get_client_ip(request)
    await enforce_rate_limits(
        RateLimitCheck(policy=PUBLIC_WRITE_IP_LIMIT, key_parts=("waitlist", str(data.business_id), client_ip)),
        RateLimitCheck(policy=PUBLIC_IDENTITY_WRITE_LIMIT, key_parts=("waitlist", str(data.business_id), data.phone)),
    )
    try:
        entry, created = await reservation_waitlist_service.create_waitlist_entry(
            db, data=data
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await db.refresh(entry)
    set_public_cookie(
        response,
        kind="waitlist_manage",
        token=issue_management_token(
            business_id=entry.business_id,
            entry_id=entry.id,
            revision=entry.management_token_revision,
        ),
    )
    if created:
        await publish(DomainEvent(
            event_type="reservation.waitlist_created",
            business_id=str(entry.business_id),
            payload={"entry_id": str(entry.id)},
        ))
    else:
        response.status_code = status.HTTP_200_OK
    return await _waitlist_response(db, entry)


@router.get(
    "/waitlist/manage",
    response_model=PublicReservationWaitlistResponse,
)
async def get_public_waitlist_entry(
    request: Request, db: AsyncSession = Depends(get_db)
):
    entry = await _public_waitlist_entry(
        db, _capability_cookie(request, "waitlist_manage"), offer=False
    )
    await db.commit()
    return await _waitlist_response(db, entry)


@router.post(
    "/waitlist/manage/cancel",
    response_model=PublicReservationWaitlistResponse,
)
async def cancel_public_waitlist_entry(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    entry = await _public_waitlist_entry(
        db, _capability_cookie(request, "waitlist_manage"), offer=False, lock=True
    )
    try:
        entry = await reservation_waitlist_service.terminal_command(
            db,
            business_id=entry.business_id,
            entry_id=entry.id,
            status="cancelled",
            actor_id=None,
            reason_code="guest_cancelled",
            note=None,
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await publish(DomainEvent(
        event_type="reservation.waitlist_cancelled",
        business_id=str(entry.business_id),
        payload={"entry_id": str(entry.id)},
    ))
    clear_public_cookie(response, kind="waitlist_manage")
    return await _waitlist_response(db, entry)


@router.post("/waitlist", response_model=ReservationWaitlistResponse, status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability("reservations.manage"))],
)
async def create_staff_waitlist_entry(
    data: ReservationWaitlistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    data = data.model_copy(update={"business_id": business.id})
    try:
        entry, _ = await reservation_waitlist_service.create_waitlist_entry(
            db, data=data, actor=current_user, public=False
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await db.refresh(entry)
    await publish(DomainEvent(
        event_type="reservation.waitlist_created",
        business_id=str(entry.business_id),
        payload={"entry_id": str(entry.id), "source": "staff"},
    ))
    return await _waitlist_response(db, entry)


@router.post("/waitlist/{entry_id}/offer", response_model=ReservationWaitlistResponse,
    dependencies=[Depends(require_capability("reservations.manage"))],
)
async def offer_reservation_waitlist_entry(
    entry_id: UUID,
    data: ReservationWaitlistOffer,
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
    await db.commit()
    await db.refresh(entry)
    token = issue_offer_token(
        business_id=entry.business_id,
        entry_id=entry.id,
        revision=entry.offer_token_revision,
    )
    offer_url = f"{settings.frontend_url}/reserve/waitlist#token={token}"
    email_attempt = await reservation_waitlist_service.deliver_waitlist_offer(
        db,
        business_id=business.id,
        entry_id=entry.id,
        offer_url=offer_url,
        channel="email",
    )
    if email_attempt is not None:
        await db.commit()
    if email_attempt is None or email_attempt.status == "failed":
        sms_attempt = await reservation_waitlist_service.prepare_waitlist_sms_fallback(
            db, business_id=business.id, entry_id=entry.id
        )
        if sms_attempt is not None:
            await db.commit()
            await reservation_waitlist_service.deliver_waitlist_offer(
                db,
                business_id=business.id,
                entry_id=entry.id,
                offer_url=offer_url,
                channel="sms",
            )
            await db.commit()
    await publish(DomainEvent(
        event_type="reservation.waitlist_offered",
        business_id=str(entry.business_id),
        payload={"entry_id": str(entry.id)},
    ))
    return await _waitlist_response(db, entry)


@router.get(
    "/waitlist/offers",
    response_model=PublicReservationWaitlistResponse,
)
async def get_public_waitlist_offer(
    request: Request, db: AsyncSession = Depends(get_db)
):
    entry = await _public_waitlist_entry(
        db, _capability_cookie(request, "waitlist_offer"), offer=True
    )
    await db.commit()
    return await _waitlist_response(db, entry)


@router.post(
    "/waitlist/offers/decline",
    response_model=PublicReservationWaitlistResponse,
)
async def decline_public_waitlist_offer(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    entry = await _public_waitlist_entry(
        db, _capability_cookie(request, "waitlist_offer"), offer=True, lock=True
    )
    try:
        entry = await reservation_waitlist_service.terminal_command(
            db,
            business_id=entry.business_id,
            entry_id=entry.id,
            status="declined",
            actor_id=None,
            reason_code="guest_declined",
            note=None,
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await publish(DomainEvent(
        event_type="reservation.waitlist_declined",
        business_id=str(entry.business_id),
        payload={"entry_id": str(entry.id)},
    ))
    clear_public_cookie(response, kind="waitlist_offer")
    return await _waitlist_response(db, entry)


@router.post("/waitlist/offers/accept", response_model=PublicReservationResponse)
async def accept_public_waitlist_offer(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    entry = await _public_waitlist_entry(
        db, _capability_cookie(request, "waitlist_offer"), offer=True, lock=True
    )
    was_accepted = entry.status == "accepted"
    try:
        reservation = await reservation_waitlist_service.accept_waitlist_offer(db, entry=entry)
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await db.refresh(reservation)
    if not was_accepted:
        await publish(DomainEvent(
            event_type="reservation.waitlist_accepted",
            business_id=str(reservation.business_id),
            payload={"reservation_id": str(reservation.id), "entry_id": str(entry.id)},
        ))
    clear_public_cookie(response, kind="waitlist_offer")
    set_public_cookie(
        response,
        kind="reservation",
        token=issue_guest_token(
            business_id=reservation.business_id,
            reservation_id=reservation.id,
            revision=reservation.guest_token_revision,
        ),
    )
    return reservation


@router.post(
    "/waitlist/{entry_id}/remove",
    response_model=ReservationWaitlistResponse,
    dependencies=[Depends(require_capability("reservations.manage"))],
)
async def remove_waitlist_entry(
    entry_id: UUID,
    data: ReservationWaitlistTerminalCommand,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    try:
        entry = await reservation_waitlist_service.terminal_command(
            db,
            business_id=business.id,
            entry_id=entry_id,
            status="removed",
            actor_id=current_user.id,
            reason_code=data.reason_code,
            note=data.note,
        )
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.commit()
    await publish(DomainEvent(
        event_type="reservation.waitlist_removed",
        business_id=str(business.id),
        payload={"entry_id": str(entry.id), "reason_code": data.reason_code},
    ))
    return await _waitlist_response(db, entry)


@router.post(
    "/waitlist/{entry_id}/delivery/retry",
    response_model=ReservationWaitlistResponse,
    dependencies=[Depends(require_capability("reservations.manage"))],
)
async def retry_waitlist_delivery(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: None = Depends(require_module("reservations")),
):
    entry = await db.scalar(select(ReservationWaitlistEntry).where(
        ReservationWaitlistEntry.id == entry_id,
        ReservationWaitlistEntry.business_id == business.id,
    ))
    if entry is None or entry.status != "offered":
        raise not_found("Waitlist entry")
    token = issue_offer_token(
        business_id=entry.business_id,
        entry_id=entry.id,
        revision=entry.offer_token_revision,
    )
    offer_url = f"{settings.frontend_url}/reserve/waitlist#token={token}"
    attempts = []
    for channel in ("email", "sms"):
        if channel == "sms":
            await reservation_waitlist_service.prepare_waitlist_sms_fallback(
                db, business_id=business.id, entry_id=entry.id
            )
            await db.commit()
        attempt = await reservation_waitlist_service.deliver_waitlist_offer(
            db,
            business_id=business.id,
            entry_id=entry.id,
            offer_url=offer_url,
            channel=channel,
        )
        if attempt is not None:
            attempts.append(attempt)
            await db.commit()
            if attempt.status == "delivered":
                break
    if not attempts:
        raise api_error(409, "DELIVERY_UNAVAILABLE", "No configured delivery channel is available")
    await publish(DomainEvent(
        event_type="reservation.waitlist_delivery_updated",
        business_id=str(business.id),
        payload={"entry_id": str(entry.id)},
    ))
    return await _waitlist_response(db, entry)


@router.post("", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability("reservations.manage"))],
)
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
    dependencies=[Depends(require_capability("reservations.view"))],
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
    dependencies=[Depends(require_capability("reservations.manage"))],
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


@router.patch("/{reservation_id}", response_model=ReservationResponse,
    dependencies=[Depends(require_capability("reservations.manage"))],
)
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


@router.post("/{reservation_id}/no-show", response_model=ReservationResponse,
    dependencies=[Depends(require_capability("reservations.manage"))],
)
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


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_capability("reservations.manage"))],
)
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
