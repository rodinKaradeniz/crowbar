import secrets
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.queue_entry import QueueEntry
from app.services import notification_service
from app.services.location_service import get_primary_location


async def _get_business(db: AsyncSession, business_id: UUID) -> Business | None:
    result = await db.execute(select(Business).where(Business.id == business_id))
    return result.scalar_one_or_none()


async def _compute_position(db: AsyncSession, business_id: UUID, joined_at: datetime) -> int:
    """Return 1-based position in the waiting queue."""
    result = await db.execute(
        select(func.count())
        .select_from(QueueEntry)
        .where(
            QueueEntry.business_id == business_id,
            QueueEntry.status == "waiting",
            QueueEntry.joined_at <= joined_at,
        )
    )
    return int(result.scalar_one() or 1)


async def _count_waiting(db: AsyncSession, business_id: UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(QueueEntry)
        .where(QueueEntry.business_id == business_id, QueueEntry.status == "waiting")
    )
    return int(result.scalar_one() or 0)


async def join_queue(
    db: AsyncSession,
    business_id: UUID,
    name: str,
    party_size: int,
    phone: str | None,
) -> dict:
    """Insert a new queue entry and return QueueStatusResponse-shaped dict."""
    token = secrets.token_urlsafe(32)
    location = await get_primary_location(db, business_id)
    entry = QueueEntry(
        business_id=business_id,
        location_id=location.id if location else None,
        session_token=token,
        name=name,
        party_size=party_size,
        phone=phone,
        status="waiting",
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)

    position = await _compute_position(db, business_id, entry.joined_at)
    total_waiting = await _count_waiting(db, business_id)

    return _build_status(entry, position, total_waiting)


async def get_entry_by_token(
    db: AsyncSession, business_id: UUID, session_token: str
) -> QueueEntry | None:
    result = await db.execute(
        select(QueueEntry).where(
            QueueEntry.business_id == business_id,
            QueueEntry.session_token == session_token,
        )
    )
    return result.scalar_one_or_none()


async def get_status_by_token(
    db: AsyncSession, business_id: UUID, session_token: str
) -> dict | None:
    entry = await get_entry_by_token(db, business_id, session_token)
    if entry is None:
        return None

    if entry.status == "waiting":
        position = await _compute_position(db, business_id, entry.joined_at)
        total_waiting = await _count_waiting(db, business_id)
    else:
        position = None
        total_waiting = await _count_waiting(db, business_id)

    return _build_status(entry, position, total_waiting)


async def get_active_entries(db: AsyncSession, business_id: UUID) -> list[QueueEntry]:
    """Return waiting + called entries ordered by joined_at."""
    result = await db.execute(
        select(QueueEntry)
        .where(
            QueueEntry.business_id == business_id,
            QueueEntry.status.in_(["waiting", "called"]),
        )
        .order_by(QueueEntry.joined_at)
    )
    return list(result.scalars().all())


async def call_entry(
    db: AsyncSession, business_id: UUID, entry_id: UUID
) -> QueueEntry | None:
    result = await db.execute(
        select(QueueEntry).where(
            QueueEntry.id == entry_id,
            QueueEntry.business_id == business_id,
            QueueEntry.status == "waiting",
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return None

    entry.status = "called"
    entry.called_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(entry)

    # Fire SMS if phone provided and business has sms channel
    if entry.phone:
        business = await _get_business(db, business_id)
        if business:
            notification_service.send_sms_if_enabled(
                business.notification_channels,
                entry.phone,
                f"Hi {entry.name}, your table is ready! Please head to the host stand.",
            )

    return entry


async def remove_by_token(
    db: AsyncSession, business_id: UUID, session_token: str
) -> QueueEntry | None:
    """Customer self-removal using their session token. Returns the entry on success."""
    result = await db.execute(
        select(QueueEntry).where(
            QueueEntry.business_id == business_id,
            QueueEntry.session_token == session_token,
            QueueEntry.status.in_(["waiting", "called"]),
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return None
    entry.status = "removed"
    entry.removed_at = datetime.now(timezone.utc)
    await db.flush()
    return entry


async def remove_entry(
    db: AsyncSession, business_id: UUID, entry_id: UUID
) -> bool:
    result = await db.execute(
        select(QueueEntry).where(
            QueueEntry.id == entry_id,
            QueueEntry.business_id == business_id,
            QueueEntry.status.in_(["waiting", "called"]),
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return False

    entry.status = "removed"
    entry.removed_at = datetime.now(timezone.utc)
    await db.flush()
    return True


def entry_to_dict(entry: QueueEntry, position: int | None = None) -> dict:
    return {
        "id": str(entry.id),
        "business_id": str(entry.business_id),
        "session_token": entry.session_token,
        "name": entry.name,
        "party_size": entry.party_size,
        "phone": entry.phone,
        "status": entry.status,
        "position": position,
        "joined_at": entry.joined_at.isoformat() if entry.joined_at else None,
        "called_at": entry.called_at.isoformat() if entry.called_at else None,
        "seated_at": entry.seated_at.isoformat() if entry.seated_at else None,
        "completed_at": entry.completed_at.isoformat() if entry.completed_at else None,
    }


def _build_status(entry: QueueEntry, position: int | None, total_waiting: int) -> dict:
    estimated = (position * 5) if position and position > 0 else None
    return {
        "entry": entry_to_dict(entry, position),
        "total_waiting": total_waiting,
        "estimated_wait_minutes": estimated,
    }
