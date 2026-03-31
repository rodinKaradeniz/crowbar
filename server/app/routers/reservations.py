from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import forbidden, not_found
from app.database import get_db
from app.dependencies import get_current_business, get_current_user
from app.models.business import Business
from app.models.user import User
from app.schemas.reservation import (
    PublicReservationCreate,
    ReservationCreate,
    ReservationResponse,
    ReservationUpdate,
)
from app.services import email_service
from app.services import reservation_service
from app.services import google_calendar_service
from app.services.reservation_notifications import (
    ReservationSnapshot,
    notify_after_reservation_create,
    notify_after_reservation_delete,
    notify_after_reservation_patch,
)
from app.core.events import DomainEvent, publish

router = APIRouter(prefix="/api/reservations", tags=["reservations"])


def _send_reservation_email(
    *,
    to_email: str,
    customer_name: str,
    business_name: str,
    service_type_name: str,
    reservation_time,
    duration_minutes: int | None,
    guests: int,
    meeting_link: str | None,
    status: str,
    business_email: str | None = None,
) -> None:
    email_service.send_reservation_confirmation(
        to_email=to_email,
        customer_name=customer_name,
        business_name=business_name,
        service_type_name=service_type_name,
        reservation_time=reservation_time,
        duration_minutes=duration_minutes,
        guests=guests,
        meeting_link=meeting_link,
        status=status,
        business_email=business_email,
    )


def _send_payment_receipt(
    *,
    to_email: str,
    customer_name: str,
    business_name: str,
    service_type_name: str,
    reservation_time,
    amount_paid: float,
    reservation_id: str,
) -> None:
    email_service.send_payment_receipt(
        to_email=to_email,
        customer_name=customer_name,
        business_name=business_name,
        service_type_name=service_type_name,
        reservation_time=reservation_time,
        amount_paid=amount_paid,
        reservation_id=reservation_id,
    )


@router.get("/business/{business_id}", response_model=list[ReservationResponse])
async def list_business_reservations(
    business_id: UUID,
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    """List reservations for the authenticated user's business."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    return await reservation_service.get_reservations_by_business(
        db, business_id, status=status_filter
    )


@router.get("/customer/{customer_id}", response_model=list[ReservationResponse])
async def list_customer_reservations(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List reservations for a customer. Only the customer themselves can access this."""
    if current_user.id != customer_id:
        raise forbidden("Not authorized to view this customer's reservations")
    return await reservation_service.get_reservations_by_customer(db, customer_id)


@router.get("/my", response_model=list[ReservationResponse])
async def list_my_reservations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await reservation_service.get_reservations_by_customer(db, current_user.id)


@router.get("/{reservation_id}", response_model=ReservationResponse)
async def get_reservation(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reservation = await reservation_service.get_reservation_by_id(db, reservation_id)
    if reservation is None:
        raise not_found("Reservation")
    # Allow access to: the customer who made it, or staff of the business
    is_customer = reservation.customer_id == current_user.id
    is_business_staff = any(
        str(s.business_id) == str(reservation.business_id)
        for s in current_user.staff_assignments
    )
    if not is_customer and not is_business_staff:
        raise forbidden("Not authorized to view this reservation")
    return reservation


@router.post("/public", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
async def create_public_reservation(
    data: PublicReservationCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Create a reservation from the public booking form (no auth required)."""
    reservation = await reservation_service.create_public_reservation(db, data)
    await db.refresh(reservation, ["business", "service_type", "customer"])
    await notify_after_reservation_create(
        db, reservation, customer_display_name=data.name
    )
    background_tasks.add_task(
        _send_reservation_email,
        to_email=reservation.email,
        customer_name=data.name,
        business_name=reservation.business.name if reservation.business else "",
        service_type_name=reservation.service_type.name if reservation.service_type else "",
        reservation_time=reservation.time,
        duration_minutes=reservation.service_type.duration if reservation.service_type else None,
        guests=reservation.guests,
        meeting_link=reservation.meeting_link,
        status=reservation.status,
        business_email=reservation.business.email if reservation.business else None,
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
    reservation = await reservation_service.create_reservation(db, current_user.id, data)
    await db.refresh(reservation, ["business", "service_type", "customer"])
    await notify_after_reservation_create(
        db, reservation, customer_display_name=current_user.name
    )
    background_tasks.add_task(
        _send_reservation_email,
        to_email=reservation.email,
        customer_name=current_user.name,
        business_name=reservation.business.name if reservation.business else "",
        service_type_name=reservation.service_type.name if reservation.service_type else "",
        reservation_time=reservation.time,
        duration_minutes=reservation.service_type.duration if reservation.service_type else None,
        guests=reservation.guests,
        meeting_link=reservation.meeting_link,
        status=reservation.status,
        business_email=reservation.business.email if reservation.business else None,
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
            "source": "authenticated",
        },
    ))
    return reservation


@router.patch("/{reservation_id}", response_model=ReservationResponse)
async def update_reservation(
    reservation_id: UUID,
    data: ReservationUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    old_reservation = await reservation_service.get_reservation_by_id(
        db, reservation_id, load_relations=True
    )
    if old_reservation is None:
        raise not_found("Reservation")

    # Access check: customer (own reservation) or business staff
    is_customer = old_reservation.customer_id == current_user.id
    is_business_staff = any(
        str(s.business_id) == str(old_reservation.business_id)
        for s in current_user.staff_assignments
    )
    if not is_customer and not is_business_staff:
        raise forbidden("Not authorized to update this reservation")

    old_snap = ReservationSnapshot.from_model(old_reservation)
    reservation = await reservation_service.update_reservation(db, reservation_id, data)
    if reservation is None:
        raise not_found("Reservation")

    send_confirmation = data.status == "confirmed" and old_snap.status == "pending"
    send_receipt = data.payment_status == "paid" and old_snap.payment_status != "paid"

    if send_confirmation or send_receipt:
        await db.refresh(reservation, ["business", "service_type", "customer"])

    # Google Calendar sync: create event when reservation is confirmed
    if send_confirmation and reservation.service_type:
        duration = reservation.service_type.duration or 60
        from datetime import timedelta as _td
        cal_event_id = await google_calendar_service.create_calendar_event(
            db,
            reservation.business_id,
            reservation_id=str(reservation.id),
            summary=f"{reservation.service_type.name} — {reservation.customer.name if reservation.customer else reservation.email}",
            description=reservation.note or "",
            start=reservation.time,
            end=reservation.time + _td(minutes=duration),
            attendee_email=reservation.email,
        )
        if cal_event_id:
            reservation.google_calendar_event_id = cal_event_id
            await db.flush()

    if send_confirmation:
        background_tasks.add_task(
            _send_reservation_email,
            to_email=reservation.email,
            customer_name=reservation.customer.name if reservation.customer else "",
            business_name=reservation.business.name if reservation.business else "",
            service_type_name=reservation.service_type.name if reservation.service_type else "",
            reservation_time=reservation.time,
            duration_minutes=reservation.service_type.duration if reservation.service_type else None,
            guests=reservation.guests,
            meeting_link=reservation.meeting_link,
            status="confirmed",
            business_email=reservation.business.email if reservation.business else None,
        )

    if send_receipt and reservation.payment_amount is not None:
        background_tasks.add_task(
            _send_payment_receipt,
            to_email=reservation.email,
            customer_name=reservation.customer.name if reservation.customer else "",
            business_name=reservation.business.name if reservation.business else "",
            service_type_name=reservation.service_type.name if reservation.service_type else "",
            reservation_time=reservation.time,
            amount_paid=float(reservation.payment_amount),
            reservation_id=str(reservation.id),
        )

    # Google Calendar sync: delete event when reservation is cancelled
    if data.status == "cancelled" and old_reservation.google_calendar_event_id:
        await google_calendar_service.delete_calendar_event(
            db, old_reservation.business_id, old_reservation.google_calendar_event_id
        )
        reservation.google_calendar_event_id = None
        await db.flush()

    await notify_after_reservation_patch(
        db, old=old_snap, new=reservation, data=data, actor=current_user
    )
    await publish(DomainEvent(
        event_type="reservation.updated",
        business_id=str(old_reservation.business_id),
        payload={
            "reservation_id": str(reservation_id),
            "old_status": old_snap.status,
            "new_status": data.status or old_snap.status,
            "old_payment_status": old_snap.payment_status,
            "new_payment_status": data.payment_status or old_snap.payment_status,
        },
    ))
    return reservation


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reservation(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reservation = await reservation_service.get_reservation_by_id(
        db, reservation_id, load_relations=True
    )
    if reservation is None:
        raise not_found("Reservation")

    is_customer = reservation.customer_id == current_user.id
    is_business_staff = any(
        str(s.business_id) == str(reservation.business_id)
        for s in current_user.staff_assignments
    )
    if not is_customer and not is_business_staff:
        raise forbidden("Not authorized to delete this reservation")

    # Google Calendar sync: delete event when reservation is deleted
    if reservation.google_calendar_event_id:
        await google_calendar_service.delete_calendar_event(
            db, reservation.business_id, reservation.google_calendar_event_id
        )

    await notify_after_reservation_delete(db, reservation, actor=current_user)
    deleted = await reservation_service.delete_reservation(db, reservation_id)
    if not deleted:
        raise not_found("Reservation")
    await publish(DomainEvent(
        event_type="reservation.deleted",
        business_id=str(reservation.business_id),
        payload={"reservation_id": str(reservation_id)},
    ))
