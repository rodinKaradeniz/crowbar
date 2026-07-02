"""Emit in-app notifications for reservation lifecycle (called from reservation routes)."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import notifications as nconst
from app.models.reservation import Reservation
from app.models.user import User
from app.schemas.reservation import ReservationUpdate
from app.services import notification_service
from sqlalchemy import select


@dataclass(frozen=True)
class ReservationSnapshot:
    """Captured before PATCH so comparisons work (same ORM row may be reused in-session)."""

    status: str
    time: datetime
    service_type_id: UUID
    guests: int

    @staticmethod
    def from_model(r: Reservation) -> "ReservationSnapshot":
        return ReservationSnapshot(
            status=r.status,
            time=r.time,
            service_type_id=r.service_type_id,
            guests=r.guests,
        )


_MATERIAL_PATCH_KEYS = frozenset(
    {
        "status",
        "time",
        "service_type_id",
        "guests",
        "note",
        "phone",
        "email",
    }
)


def _patch_is_material(data: ReservationUpdate) -> bool:
    patch = data.model_dump(exclude_unset=True)
    return bool(_MATERIAL_PATCH_KEYS & patch.keys())


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M")


async def notify_staff_new_reservation(
    db: AsyncSession,
    reservation: Reservation,
    *,
    customer_display_name: str,
    is_first_booking_at_business: bool,
) -> None:
    business_name = reservation.business.name if reservation.business else "Business"
    service_name = reservation.service_type.name if reservation.service_type else "Service"
    status_label = "Request" if reservation.status == "pending" else "Booking"
    first = (
        " First-time customer at your business."
        if is_first_booking_at_business
        else ""
    )
    title = f"New {status_label.lower()}: {service_name}"
    body = (
        f"{customer_display_name} — {_fmt_time(reservation.time)} at {business_name}.{first}"
    )
    await notification_service.notify_business_staff(
        db,
        business_id=reservation.business_id,
        kind=nconst.RESERVATION_CREATED,
        title=title,
        body=body.strip(),
        payload={
            "reservation_id": str(reservation.id),
            "status": reservation.status,
            "is_first_booking_at_business": is_first_booking_at_business,
        },
    )


async def notify_after_reservation_create(
    db: AsyncSession,
    reservation: Reservation,
    *,
    customer_display_name: str,
) -> None:
    count = await notification_service.count_reservations_for_customer_at_business(
        db, reservation.business_id, reservation.customer_id
    )
    is_first = count == 1
    await notify_staff_new_reservation(
        db,
        reservation,
        customer_display_name=customer_display_name,
        is_first_booking_at_business=is_first,
    )


def _staff_patch_kind(old: ReservationSnapshot, new: Reservation) -> tuple[str, str, str]:
    if new.status == "cancelled" and old.status != "cancelled":
        return (
            nconst.RESERVATION_CANCELLED,
            "Reservation cancelled",
            f"Reservation {_fmt_time(new.time)} is now cancelled.",
        )
    return (
        nconst.RESERVATION_UPDATED,
        "Reservation updated",
        f"A reservation for {_fmt_time(new.time)} was updated.",
    )


async def notify_after_reservation_patch(
    db: AsyncSession,
    *,
    old: ReservationSnapshot,
    new: Reservation,
    data: ReservationUpdate,
    actor: User,
) -> None:
    if not _patch_is_material(data):
        return

    exclude = actor.id if actor.user_type == "staff" else None

    kind, title, body = _staff_patch_kind(old, new)
    await notification_service.notify_business_staff(
        db,
        business_id=new.business_id,
        kind=kind,
        title=title,
        body=body,
        payload={"reservation_id": str(new.id)},
        exclude_user_id=exclude,
    )

    # SMS: ping the customer when staff confirm/cancel/update their booking.
    if actor.user_type == "staff" and new.business:
        if new.status == "cancelled" and old.status != "cancelled":
            sms_body = f"Your booking for {_fmt_time(new.time)} was cancelled."
        elif old.status == "pending" and new.status == "confirmed":
            sms_body = f"Your booking for {_fmt_time(new.time)} is confirmed."
        else:
            sms_body = f"Your booking for {_fmt_time(new.time)} was updated."
        channels = new.business.notification_channels or []
        notification_service.send_sms_if_enabled(
            channels,
            new.phone,
            f"Slotera: {sms_body}",
        )


async def notify_after_reservation_delete(
    db: AsyncSession,
    reservation: Reservation,
    *,
    actor: User,
) -> None:
    exclude = actor.id if actor.user_type == "staff" else None
    await notification_service.notify_business_staff(
        db,
        business_id=reservation.business_id,
        kind=nconst.RESERVATION_CANCELLED,
        title="Reservation removed",
        body=f"A reservation for {_fmt_time(reservation.time)} was removed.",
        payload={"reservation_id": str(reservation.id)},
        exclude_user_id=exclude,
    )

    if actor.user_type == "staff" and reservation.business:
        channels = reservation.business.notification_channels or []
        notification_service.send_sms_if_enabled(
            channels,
            reservation.phone,
            f"Slotera: Your booking for {_fmt_time(reservation.time)} was cancelled.",
        )
