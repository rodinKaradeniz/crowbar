from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.queue_entry import QueueEntry
from app.models.reservation import Reservation


async def get_customer_by_id(
    db: AsyncSession, customer_id: UUID, business_id: UUID
) -> Customer | None:
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.business_id == business_id,
        )
    )
    return result.scalar_one_or_none()


async def get_customers_by_business(
    db: AsyncSession, business_id: UUID
) -> list[Customer]:
    """All customer rows scoped to a business, sorted by name."""
    result = await db.execute(
        select(Customer)
        .where(Customer.business_id == business_id)
        .order_by(Customer.name.nullslast(), Customer.created_at.desc())
    )
    return list(result.scalars().all())


async def get_all_visitors(db: AsyncSession, business_id: UUID) -> list[dict[str, Any]]:
    """Unified visitor list: every Customer with their reservation aggregates,
    plus queue walk-ins not already represented (deduped by phone)."""
    res_rows = await db.execute(
        select(
            Customer.id,
            Customer.name,
            Customer.email,
            Customer.phone,
            func.count(Reservation.id).label("visit_count"),
            func.max(Reservation.time).label("last_visit"),
        )
        .join(Reservation, Reservation.customer_id == Customer.id)
        .where(Customer.business_id == business_id)
        .group_by(Customer.id, Customer.name, Customer.email, Customer.phone)
        .order_by(Customer.name.nullslast())
    )
    res_customers = res_rows.all()
    known_phones: set[str] = {row.phone for row in res_customers if row.phone}

    walkin_rows = await db.execute(
        select(
            QueueEntry.id,
            QueueEntry.name,
            QueueEntry.phone,
            QueueEntry.party_size,
            QueueEntry.seated_at,
            QueueEntry.joined_at,
        )
        .where(
            QueueEntry.business_id == business_id,
            QueueEntry.status.in_(["seated", "removed"]),
        )
        .order_by(QueueEntry.seated_at.desc().nullslast(), QueueEntry.joined_at.desc())
    )
    walkins = walkin_rows.all()

    groups: dict[str, list] = {}
    for w in walkins:
        if w.phone and w.phone in known_phones:
            continue
        key = w.phone if w.phone else str(w.id)
        groups.setdefault(key, []).append(w)

    visitors: list[dict[str, Any]] = []

    for row in res_customers:
        visitors.append({
            "id": str(row.id),
            "name": row.name,
            "email": row.email,
            "phone": row.phone,
            "source": "reservation",
            "visit_count": row.visit_count,
            "last_visit": row.last_visit,
            "party_size": None,
        })

    for entries in groups.values():
        latest = max(entries, key=lambda e: e.seated_at or e.joined_at or datetime.min)
        visitors.append({
            "id": str(latest.id),
            "name": latest.name,
            "email": None,
            "phone": latest.phone,
            "source": "walkin",
            "visit_count": len(entries),
            "last_visit": latest.seated_at or latest.joined_at,
            "party_size": latest.party_size,
        })

    return visitors
