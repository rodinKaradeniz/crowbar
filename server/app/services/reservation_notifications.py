"""Emit in-app notifications for reservation lifecycle (called from reservation routes)."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import notifications as nconst
from app.models.reservation import Reservation
from app.models.user import User
from app.schemas.reservation import ReservationUpdate
from app.services import notification_service


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
        "note",
        "phone",
        "email",
    }
)


def _patch_is_material(data: ReservationUpdate) -> bool:
    patch = data.model_dump(exclude_unset=True)
    return bool(_MATERIAL_PATCH_KEYS & patch.keys())


def _fmt_time(dt: datetime, timezone_name: str = "UTC") -> str:
    return dt.astimezone(ZoneInfo(timezone_name)).strftime("%Y-%m-%d %H:%M")


async def notify_staff_new_reservation(
    db: AsyncSession,
    reservation: Reservation,
    *,
    customer_display_name: str,
    is_first_booking_at_business: bool,
    actor: User | None = None,
) -> None:
    business_name = reservation.business.name if reservation.business else "Business"
    timezone_name = reservation.business.timezone if reservation.business else "UTC"
    service_name = reservation.service_type.name if reservation.service_type else "Service"
    status_label = "Request" if reservation.status == "pending" else "Booking"
    first = (
        " First-time customer at your business."
        if is_first_booking_at_business
        else ""
    )
    is_override = reservation.availability_override_reason is not None
    title = (
        f"Availability override: {service_name}"
        if is_override
        else f"New {status_label.lower()}: {service_name}"
    )
    body = (
        f"{customer_display_name} — {_fmt_time(reservation.time, timezone_name)} at {business_name}.{first}"
    )
    if is_override:
        body = f"{body} Reason: {reservation.availability_override_reason}"
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
            "availability_overridden": is_override,
            "availability_override_by": (
                str(reservation.availability_override_by)
                if reservation.availability_override_by
                else None
            ),
        },
        exclude_user_id=actor.id if actor is not None else None,
    )


async def notify_after_reservation_create(
    db: AsyncSession,
    reservation: Reservation,
    *,
    customer_display_name: str,
    actor: User | None = None,
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
        actor=actor,
    )


def _staff_patch_kind(old: ReservationSnapshot, new: Reservation) -> tuple[str, str, str]:
    timezone_name = new.business.timezone if new.business else "UTC"
    if new.status == "cancelled" and old.status != "cancelled":
        return (
            nconst.RESERVATION_CANCELLED,
            "Reservation cancelled",
            f"Reservation {_fmt_time(new.time, timezone_name)} is now cancelled.",
        )
    return (
        nconst.RESERVATION_UPDATED,
        "Reservation updated",
        f"A reservation for {_fmt_time(new.time, timezone_name)} was updated.",
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
        timezone_name = new.business.timezone or "UTC"
        if new.status == "cancelled" and old.status != "cancelled":
            sms_body = f"Your booking for {_fmt_time(new.time, timezone_name)} was cancelled."
        elif old.status == "pending" and new.status == "confirmed":
            sms_body = f"Your booking for {_fmt_time(new.time, timezone_name)} is confirmed."
        else:
            sms_body = f"Your booking for {_fmt_time(new.time, timezone_name)} was updated."
        channels = new.business.notification_channels or []
        notification_service.send_sms_if_enabled(
            channels,
            new.phone,
            f"Crowbar: {sms_body}",
            # The guest is being told about the booking they made.
            message_class="operational",
        )


async def notify_after_reservation_reschedule(
    db: AsyncSession,
    *,
    old: ReservationSnapshot,
    new: Reservation,
    actor: User,
) -> None:
    timezone_name = new.business.timezone if new.business else "UTC"
    is_override = new.availability_override_reason is not None
    body = (
        f"Reservation moved from {_fmt_time(old.time, timezone_name)} to {_fmt_time(new.time, timezone_name)}."
    )
    if is_override:
        body = f"{body} Availability overridden: {new.availability_override_reason}"
    await notification_service.notify_business_staff(
        db,
        business_id=new.business_id,
        kind=nconst.RESERVATION_UPDATED,
        title=(
            "Reservation rescheduled with availability override"
            if is_override
            else "Reservation rescheduled"
        ),
        body=body,
        payload={
            "reservation_id": str(new.id),
            "old_time": old.time.isoformat(),
            "new_time": new.time.isoformat(),
            "old_service_type_id": str(old.service_type_id),
            "new_service_type_id": str(new.service_type_id),
            "old_guests": old.guests,
            "new_guests": new.guests,
            "availability_overridden": is_override,
            "availability_override_by": (
                str(new.availability_override_by)
                if new.availability_override_by
                else None
            ),
        },
        exclude_user_id=actor.id,
    )


def send_reschedule_sms(
    *,
    notification_channels: list,
    phone: str,
    business_name: str,
    reservation_time: datetime,
    timezone_name: str,
) -> None:
    notification_service.send_sms_if_enabled(
        notification_channels,
        phone,
        f"Crowbar: Your reservation at {business_name} was rescheduled to {_fmt_time(reservation_time, timezone_name)}.",
        message_class="operational",
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
        body=f"A reservation for {_fmt_time(reservation.time, reservation.business.timezone if reservation.business else 'UTC')} was removed.",
        payload={"reservation_id": str(reservation.id)},
        exclude_user_id=exclude,
    )

    if actor.user_type == "staff" and reservation.business:
        channels = reservation.business.notification_channels or []
        notification_service.send_sms_if_enabled(
            channels,
            reservation.phone,
            f"Crowbar: Your booking for {_fmt_time(reservation.time, reservation.business.timezone or 'UTC')} was cancelled.",
            message_class="operational",
        )
