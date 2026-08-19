from __future__ import annotations

import hashlib
import json
import secrets
from datetime import date, datetime, timedelta, timezone
from statistics import median
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.queue_entry import QueueEntry, QueueEntryEvent, QueueServiceDay
from app.models.reservation_delivery_attempt import DeliveryAttempt
from app.services import sms_service
from app.services.customer_identity_service import upsert_customer
from app.services.floor_plan_service import resolve_service_window
from app.services.location_service import get_primary_location


ACTIVE_STATUSES = ("waiting", "called")


class QueuePolicyError(ValueError):
    def __init__(self, message: str, *, code: str, status_code: int = 409):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


def request_fingerprint(*, name: str, party_size: int, phone: str | None) -> str:
    payload = json.dumps(
        {"name": name.strip(), "party_size": party_size, "phone": phone},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def calculate_wait_estimate(durations_minutes: list[float]) -> int | None:
    """Measured median rounded to five minutes; no estimate below five samples."""
    if len(durations_minutes) < 5:
        return None
    measured = float(median(durations_minutes))
    return max(5, int((measured + 2.5) // 5) * 5)


async def _business(db: AsyncSession, business_id: UUID) -> Business:
    business = await db.scalar(select(Business).where(Business.id == business_id))
    if business is None:
        raise QueuePolicyError("Business not found", code="NOT_FOUND", status_code=404)
    return business


async def _context(db: AsyncSession, business_id: UUID):
    business = await _business(db, business_id)
    location = await get_primary_location(db, business_id)
    if location is None:
        raise QueuePolicyError(
            "A primary location is required before the queue can open",
            code="QUEUE_LOCATION_REQUIRED",
        )
    service_date, _, _ = resolve_service_window(business)
    return business, location, service_date


async def _waiting_covers(
    db: AsyncSession, business_id: UUID, location_id: UUID, service_date: date
) -> int:
    value = await db.scalar(
        select(func.coalesce(func.sum(QueueEntry.party_size), 0)).where(
            QueueEntry.business_id == business_id,
            QueueEntry.location_id == location_id,
            QueueEntry.service_date == service_date,
            QueueEntry.status.in_(ACTIVE_STATUSES),
        )
    )
    return int(value or 0)


async def measured_wait_estimate(
    db: AsyncSession, business_id: UUID, location_id: UUID, service_date: date
) -> int | None:
    rows = await db.scalars(
        select(QueueEntry)
        .where(
            QueueEntry.business_id == business_id,
            QueueEntry.location_id == location_id,
            QueueEntry.service_date >= service_date - timedelta(days=30),
            QueueEntry.service_date <= service_date,
            QueueEntry.seated_at.is_not(None),
        )
        .order_by(QueueEntry.seated_at.desc())
        .limit(30)
    )
    durations = [
        (entry.seated_at - entry.joined_at).total_seconds() / 60
        for entry in rows.all()
        if entry.seated_at is not None and entry.seated_at >= entry.joined_at
    ]
    return calculate_wait_estimate(durations)


async def get_service_day(db: AsyncSession, business_id: UUID, *, lock: bool = False) -> dict:
    _, location, service_date = await _context(db, business_id)
    query = select(QueueServiceDay).where(
        QueueServiceDay.business_id == business_id,
        QueueServiceDay.location_id == location.id,
        QueueServiceDay.service_date == service_date,
    )
    if lock:
        query = query.with_for_update()
    policy = await db.scalar(query)
    covers = await _waiting_covers(db, business_id, location.id, service_date)
    estimate = await measured_wait_estimate(db, business_id, location.id, service_date)
    return {
        "policy": policy,
        "location": location,
        "service_date": service_date,
        "waiting_covers": covers,
        "estimated_wait_minutes": estimate,
    }


def service_day_to_dict(state: dict) -> dict:
    policy = state["policy"]
    is_open = policy is not None and policy.status == "open"
    capacity = policy.max_waiting_covers if policy is not None else None
    covers = state["waiting_covers"]
    return {
        "service_date": state["service_date"],
        "status": policy.status if policy is not None else "closed",
        "is_open": is_open,
        "is_full": bool(is_open and capacity is not None and covers >= capacity),
        "max_waiting_covers": capacity,
        "waiting_covers": covers,
        "estimated_wait_minutes": state["estimated_wait_minutes"],
        "updated_at": policy.updated_at if policy is not None else None,
    }


async def set_service_day(
    db: AsyncSession,
    business_id: UUID,
    *,
    status: str,
    max_waiting_covers: int,
    actor_id: UUID,
) -> tuple[QueueServiceDay, bool]:
    state = await get_service_day(db, business_id, lock=True)
    policy = state["policy"]
    now = datetime.now(timezone.utc)
    changed = policy is None or policy.status != status
    if policy is None:
        policy = QueueServiceDay(
            business_id=business_id,
            location_id=state["location"].id,
            service_date=state["service_date"],
            status=status,
            max_waiting_covers=max_waiting_covers,
            changed_by=actor_id,
        )
        db.add(policy)
    policy.status = status
    policy.max_waiting_covers = max_waiting_covers
    policy.changed_by = actor_id
    if status == "open":
        policy.opened_at = now
        policy.closed_at = None
        old_entries = list(
            (
                await db.scalars(
                    select(QueueEntry)
                    .where(
                        QueueEntry.business_id == business_id,
                        QueueEntry.location_id == state["location"].id,
                        QueueEntry.service_date < state["service_date"],
                        QueueEntry.status.in_(ACTIVE_STATUSES),
                    )
                    .order_by(QueueEntry.id)
                    .with_for_update()
                )
            ).all()
        )
        for entry in old_entries:
            _terminalize(
                entry,
                reason_code="service_day_ended",
                actor_id=actor_id,
                note=None,
                now=now,
            )
            db.add(
                QueueEntryEvent(
                    business_id=business_id,
                    queue_entry_id=entry.id,
                    event_type="removed",
                    actor_id=actor_id,
                    reason_code="service_day_ended",
                    occurred_at=now,
                )
            )
    else:
        policy.closed_at = now
    await db.flush()
    return policy, changed


async def _compute_position(db: AsyncSession, entry: QueueEntry) -> int:
    value = await db.scalar(
        select(func.count()).select_from(QueueEntry).where(
            QueueEntry.business_id == entry.business_id,
            QueueEntry.location_id == entry.location_id,
            QueueEntry.service_date == entry.service_date,
            QueueEntry.status == "waiting",
            QueueEntry.joined_at <= entry.joined_at,
        )
    )
    return int(value or 1)


async def _count_waiting(db: AsyncSession, entry: QueueEntry) -> int:
    value = await db.scalar(
        select(func.count()).select_from(QueueEntry).where(
            QueueEntry.business_id == entry.business_id,
            QueueEntry.location_id == entry.location_id,
            QueueEntry.service_date == entry.service_date,
            QueueEntry.status == "waiting",
        )
    )
    return int(value or 0)


async def join_queue(
    db: AsyncSession,
    business_id: UUID,
    name: str,
    party_size: int,
    phone: str | None,
    idempotency_key: str,
    *,
    actor_id: UUID | None = None,
    channel: str = "web",
) -> tuple[dict, bool]:
    fingerprint = request_fingerprint(name=name, party_size=party_size, phone=phone)
    existing = await db.scalar(
        select(QueueEntry).where(
            QueueEntry.business_id == business_id,
            QueueEntry.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.request_fingerprint != fingerprint:
            raise QueuePolicyError(
                "This idempotency key was already used for a different queue request",
                code="IDEMPOTENCY_CONFLICT",
            )
        return await _build_status(db, existing), False

    state = await get_service_day(db, business_id, lock=True)
    policy = state["policy"]
    if policy is None or policy.status != "open":
        raise QueuePolicyError("The queue is closed for this service day", code="QUEUE_CLOSED")

    # Recheck after the shared service-day lock so concurrent retries converge.
    existing = await db.scalar(
        select(QueueEntry).where(
            QueueEntry.business_id == business_id,
            QueueEntry.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.request_fingerprint != fingerprint:
            raise QueuePolicyError(
                "This idempotency key was already used for a different queue request",
                code="IDEMPOTENCY_CONFLICT",
            )
        return await _build_status(db, existing), False
    if phone is not None:
        duplicate = await db.scalar(
            select(QueueEntry.id).where(
                QueueEntry.business_id == business_id,
                QueueEntry.phone == phone,
                QueueEntry.status.in_(ACTIVE_STATUSES),
            )
        )
        if duplicate is not None:
            raise QueuePolicyError(
                "A party with this phone number is already in the queue",
                code="QUEUE_DUPLICATE_PHONE",
            )
    if state["waiting_covers"] + party_size > policy.max_waiting_covers:
        raise QueuePolicyError("The queue is full", code="QUEUE_FULL")

    customer = await upsert_customer(db, business_id=business_id, phone=phone, name=name)
    entry = QueueEntry(
        business_id=business_id,
        location_id=state["location"].id,
        customer_id=customer.id if customer else None,
        session_token=secrets.token_urlsafe(32),
        name=name,
        party_size=party_size,
        phone=phone,
        channel=channel,
        idempotency_key=idempotency_key,
        request_fingerprint=fingerprint,
        service_date=state["service_date"],
        status="waiting",
    )
    db.add(entry)
    await db.flush()
    db.add(
        QueueEntryEvent(
            business_id=business_id,
            queue_entry_id=entry.id,
            event_type="joined",
            actor_id=actor_id,
        )
    )
    await db.flush()
    return await _build_status(db, entry), True


async def get_entry_by_token(
    db: AsyncSession, business_id: UUID, session_token: str
) -> QueueEntry | None:
    return await db.scalar(
        select(QueueEntry).where(
            QueueEntry.business_id == business_id,
            QueueEntry.session_token == session_token,
        )
    )


async def get_status_by_token(
    db: AsyncSession, business_id: UUID, session_token: str
) -> dict | None:
    entry = await get_entry_by_token(db, business_id, session_token)
    return await _build_status(db, entry) if entry is not None else None


async def get_active_entries(db: AsyncSession, business_id: UUID) -> list[QueueEntry]:
    _, location, service_date = await _context(db, business_id)
    rows = await db.scalars(
        select(QueueEntry)
        .where(
            QueueEntry.business_id == business_id,
            QueueEntry.location_id == location.id,
            QueueEntry.service_date == service_date,
            QueueEntry.status.in_(ACTIVE_STATUSES),
        )
        .order_by(QueueEntry.joined_at)
    )
    return list(rows.all())


async def call_entry(
    db: AsyncSession, business_id: UUID, entry_id: UUID, actor_id: UUID
) -> QueueEntry | None:
    entry = await db.scalar(
        select(QueueEntry)
        .where(
            QueueEntry.id == entry_id,
            QueueEntry.business_id == business_id,
            QueueEntry.status == "waiting",
        )
        .with_for_update()
    )
    if entry is None:
        return None
    now = datetime.now(timezone.utc)
    entry.status = "called"
    entry.called_at = now
    db.add(
        QueueEntryEvent(
            business_id=business_id,
            queue_entry_id=entry.id,
            event_type="called",
            actor_id=actor_id,
            occurred_at=now,
        )
    )
    business = await _business(db, business_id)
    if entry.phone and "sms" in (business.notification_channels or []):
        attempt = await db.scalar(
            select(DeliveryAttempt).where(
                DeliveryAttempt.queue_entry_id == entry.id,
                DeliveryAttempt.message_kind == "queue_called",
                DeliveryAttempt.channel == "sms",
            )
        )
        if attempt is None:
            db.add(
                DeliveryAttempt(
                    business_id=business_id,
                    queue_entry_id=entry.id,
                    message_kind="queue_called",
                    channel="sms",
                    status="pending",
                )
            )
    await db.flush()
    return entry


async def deliver_queue_call(
    db: AsyncSession, business_id: UUID, entry_id: UUID
) -> DeliveryAttempt | None:
    entry = await db.scalar(
        select(QueueEntry).where(
            QueueEntry.id == entry_id, QueueEntry.business_id == business_id
        )
    )
    if entry is None:
        return None
    attempt = await db.scalar(
        select(DeliveryAttempt)
        .where(
            DeliveryAttempt.business_id == business_id,
            DeliveryAttempt.queue_entry_id == entry_id,
            DeliveryAttempt.message_kind == "queue_called",
            DeliveryAttempt.channel == "sms",
        )
        .with_for_update()
    )
    if attempt is None or attempt.status == "delivered":
        return attempt
    attempt.status = "pending"
    attempt.attempt_count += 1
    attempt.last_attempt_at = datetime.now(timezone.utc)
    await db.flush()
    sent = sms_service.send_sms(
        entry.phone or "",
        f"Hi {entry.name}, your table is ready. Please head to the host stand.",
    )
    if sent:
        attempt.status = "delivered"
        attempt.delivered_at = datetime.now(timezone.utc)
        attempt.last_error = None
    else:
        attempt.status = "failed"
        attempt.last_error = "SMS delivery failed or no provider is configured"
    await db.flush()
    return attempt


def _terminalize(
    entry: QueueEntry,
    *,
    reason_code: str,
    actor_id: UUID | None,
    note: str | None,
    now: datetime,
) -> None:
    entry.status = "removed"
    entry.removed_at = now
    entry.terminal_actor_id = actor_id
    entry.terminal_reason_code = reason_code
    entry.terminal_reason_note = note


async def remove_by_token(
    db: AsyncSession, business_id: UUID, session_token: str
) -> QueueEntry | None:
    entry = await db.scalar(
        select(QueueEntry)
        .where(
            QueueEntry.business_id == business_id,
            QueueEntry.session_token == session_token,
            QueueEntry.status.in_(ACTIVE_STATUSES),
        )
        .with_for_update()
    )
    if entry is None:
        return None
    now = datetime.now(timezone.utc)
    _terminalize(entry, reason_code="guest_left", actor_id=None, note=None, now=now)
    db.add(
        QueueEntryEvent(
            business_id=business_id,
            queue_entry_id=entry.id,
            event_type="removed",
            reason_code="guest_left",
            occurred_at=now,
        )
    )
    await db.flush()
    return entry


async def remove_entry(
    db: AsyncSession,
    business_id: UUID,
    entry_id: UUID,
    *,
    actor_id: UUID,
    reason_code: str,
    note: str | None,
) -> QueueEntry | None:
    entry = await db.scalar(
        select(QueueEntry)
        .where(
            QueueEntry.id == entry_id,
            QueueEntry.business_id == business_id,
            QueueEntry.status.in_(ACTIVE_STATUSES),
        )
        .with_for_update()
    )
    if entry is None:
        return None
    now = datetime.now(timezone.utc)
    _terminalize(entry, reason_code=reason_code, actor_id=actor_id, note=note, now=now)
    db.add(
        QueueEntryEvent(
            business_id=business_id,
            queue_entry_id=entry.id,
            event_type="removed",
            actor_id=actor_id,
            reason_code=reason_code,
            reason_note=note,
            occurred_at=now,
        )
    )
    await db.flush()
    return entry


async def delivery_summary(db: AsyncSession, entry_id: UUID) -> dict:
    attempt = await db.scalar(
        select(DeliveryAttempt).where(
            DeliveryAttempt.queue_entry_id == entry_id,
            DeliveryAttempt.message_kind == "queue_called",
            DeliveryAttempt.channel == "sms",
        )
    )
    if attempt is None:
        return {
            "state": "unavailable",
            "channel": None,
            "retryable": False,
            "attempt_count": 0,
        }
    return {
        "state": attempt.status,
        "channel": attempt.channel,
        "retryable": attempt.status == "failed",
        "attempt_count": attempt.attempt_count,
        "last_error": attempt.last_error,
    }


async def entry_to_dict(
    db: AsyncSession, entry: QueueEntry, position: int | None = None
) -> dict:
    return {
        "id": str(entry.id),
        "business_id": str(entry.business_id),
        "session_token": entry.session_token,
        "name": entry.name,
        "party_size": entry.party_size,
        "phone": entry.phone,
        "status": entry.status,
        "position": position,
        "service_date": entry.service_date,
        "joined_at": entry.joined_at,
        "called_at": entry.called_at,
        "seated_at": entry.seated_at,
        "completed_at": entry.completed_at,
        "removed_at": entry.removed_at,
        "terminal_reason_code": entry.terminal_reason_code,
        "terminal_reason_note": entry.terminal_reason_note,
        "delivery": await delivery_summary(db, entry.id),
    }


async def _build_status(db: AsyncSession, entry: QueueEntry) -> dict:
    position = await _compute_position(db, entry) if entry.status == "waiting" else None
    total_waiting = await _count_waiting(db, entry)
    estimate = (
        await measured_wait_estimate(
            db, entry.business_id, entry.location_id, entry.service_date
        )
        if entry.location_id
        else None
    )
    return {
        "entry": await entry_to_dict(db, entry, position),
        "total_waiting": total_waiting,
        "estimated_wait_minutes": estimate,
    }
