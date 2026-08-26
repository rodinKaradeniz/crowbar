from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.reservation import Reservation
from app.models.user import User
from app.services import staff_service
from app.services import sms_service
from app.services.marketing_consent_service import MessageClass


async def count_reservations_for_customer_at_business(
    db: AsyncSession, business_id: UUID, customer_id: UUID
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Reservation)
        .where(
            Reservation.business_id == business_id,
            Reservation.customer_id == customer_id,
        )
    )
    return int(result.scalar_one() or 0)


async def notify_business_staff(
    db: AsyncSession,
    *,
    business_id: UUID,
    kind: str,
    title: str,
    body: str,
    payload: dict | None = None,
    exclude_user_id: UUID | None = None,
) -> None:
    staff_list = await staff_service.get_staff_by_business(db, business_id)
    pl = payload or {}
    for s in staff_list:
        if exclude_user_id is not None and s.user_id == exclude_user_id:
            continue
        db.add(
            Notification(
                user_id=s.user_id,
                business_id=business_id,
                kind=kind,
                title=title,
                body=body,
                payload=pl,
            )
        )
    await db.flush()


async def list_for_user(
    db: AsyncSession,
    user_id: UUID,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[Notification]:
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def list_for_user_with_linked(
    db: AsyncSession,
    current_user: "User",
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """
    Return notifications for the current user plus any other users sharing
    the same email address (e.g. a staff user who also has a customer account).
    Each item is a dict with all Notification fields plus `source_type`.
    """
    # Find all user_ids with the same email
    linked_result = await db.execute(
        select(User.id, User.user_type).where(User.email == current_user.email)
    )
    linked = {row.id: row.user_type for row in linked_result.all()}
    all_ids = list(linked.keys())

    result = await db.execute(
        select(Notification)
        .where(Notification.user_id.in_(all_ids))
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    items = result.scalars().all()

    output = []
    for n in items:
        d = {
            "id": n.id,
            "user_id": n.user_id,
            "business_id": n.business_id,
            "kind": n.kind,
            "title": n.title,
            "body": n.body,
            "payload": n.payload,
            "read_at": n.read_at,
            "created_at": n.created_at,
            "source_type": linked.get(n.user_id),
        }
        output.append(d)
    return output


async def unread_count_with_linked(
    db: AsyncSession,
    current_user: "User",
) -> int:
    """Unread count across all accounts with the same email."""
    linked_result = await db.execute(
        select(User.id).where(User.email == current_user.email)
    )
    all_ids = [row.id for row in linked_result.all()]
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id.in_(all_ids),
            Notification.read_at.is_(None),
        )
    )
    return int(result.scalar_one() or 0)


async def unread_count(db: AsyncSession, user_id: UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    )
    return int(result.scalar_one() or 0)


async def mark_read(
    db: AsyncSession, notification_id: UUID, user_id: UUID
) -> Notification | None:
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    n = result.scalar_one_or_none()
    if n is None:
        return None
    if n.read_at is None:
        n.read_at = datetime.now(timezone.utc)
        await db.flush()
    return n


async def mark_all_read(db: AsyncSession, user_id: UUID) -> int:
    result = await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )
    await db.flush()
    return result.rowcount or 0


def send_sms_if_enabled(
    notification_channels: list,
    phone: str | None,
    body: str,
    *,
    message_class: MessageClass,
) -> None:
    """
    Send an SMS if 'sms' is in the business's notification_channels.
    Fires-and-forgets (sync call to sms_service). Does not raise on failure.

    `message_class` is required and has no default. Every caller has to say
    whether this message is operational — something the guest asked for — or
    marketing. Marketing sends must additionally clear
    `marketing_consent_service.is_suppressed` before reaching here; this
    function has no database session and so cannot check consent itself, which
    is why the argument is mandatory rather than merely advisory.

    See `app/services/marketing_consent_service.py` for the rule.
    """
    if message_class not in ("operational", "marketing"):
        raise ValueError(f"Unknown message class: {message_class}")
    if "sms" not in notification_channels:
        return
    if not phone:
        return
    sms_service.send_sms(phone, body)
