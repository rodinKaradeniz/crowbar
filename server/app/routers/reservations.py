from datetime import date
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import api_error, forbidden, not_found
from app.core.rate_limit import (
    PUBLIC_IDENTITY_WRITE_LIMIT,
    PUBLIC_WRITE_IP_LIMIT,
    RateLimitCheck,
    enforce_rate_limits,
    get_client_ip,
)
from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_module
from app.models.business import Business
from app.models.user import User
from app.schemas.reservation import (
    PublicReservationCreate,
    ReservationCreate,
    ReservationReschedule,
    ReservationResponse,
    ReservationUpdate,
)
from app.schemas.booking_schedule import AvailabilityResponse
from app.services import email_service
from app.services import reservation_service
from app.services.availability_service import AvailabilityError
from app.services.reservation_notifications import (
    ReservationSnapshot,
    notify_after_reservation_create,
    notify_after_reservation_delete,
    notify_after_reservation_patch,
    notify_after_reservation_reschedule,
    send_reschedule_sms,
)
from app.core.events import DomainEvent, publish

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
    )


def _reservation_duration_minutes(reservation) -> int:
    return max(
        int((reservation.ends_at - reservation.time).total_seconds() // 60),
        1,
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
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.refresh(reservation, ["business", "service_type", "customer"])
    await notify_after_reservation_create(
        db, reservation, customer_display_name=data.name
    )
    await db.commit()
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


@router.post("", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
async def create_reservation(
    data: ReservationCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        reservation = await reservation_service.create_reservation(db, data)
    except AvailabilityError as exc:
        raise _availability_http_error(exc) from exc
    await db.refresh(reservation, ["business", "service_type", "customer"])
    display_name = (reservation.customer.name if reservation.customer else None) or reservation.phone
    await notify_after_reservation_create(
        db, reservation, customer_display_name=display_name
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
