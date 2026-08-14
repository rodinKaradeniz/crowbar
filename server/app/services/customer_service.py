"""Business-scoped guest CRM reads and mutations.

The timeline deliberately projects reservations, queue entries, tabs, and
orders from their authoritative tables. It does not create a second event
ledger that could drift from service operations.
"""

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import (
    Customer,
    CustomerDataRequest,
    CustomerMarketingConsent,
    CustomerMergeAudit,
    CustomerNote,
    CustomerTag,
)
from app.models.order import Order
from app.models.queue_entry import QueueEntry
from app.models.reservation import Reservation
from app.models.tab import Tab
from app.schemas.customer import CustomerProfileUpdate, GuestTimelineEntry


async def get_customer_by_id(
    db: AsyncSession, customer_id: UUID, business_id: UUID
) -> Customer | None:
    return await db.scalar(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.business_id == business_id,
            Customer.merged_into_customer_id.is_(None),
        )
    )


async def get_customers_by_business(
    db: AsyncSession, business_id: UUID
) -> list[Customer]:
    result = await db.execute(
        select(Customer)
        .where(
            Customer.business_id == business_id,
            Customer.merged_into_customer_id.is_(None),
        )
        .order_by(Customer.name.nullslast(), Customer.created_at.desc())
    )
    return list(result.scalars().all())


async def get_all_visitors(db: AsyncSession, business_id: UUID) -> list[dict[str, Any]]:
    """Compatibility visitor list backed by real customer identities only."""
    rows = await db.execute(
        select(
            Customer.id,
            Customer.name,
            Customer.email,
            Customer.phone,
            func.count(Reservation.id).label("visit_count"),
            func.max(Reservation.time).label("last_visit"),
        )
        .outerjoin(Reservation, Reservation.customer_id == Customer.id)
        .where(
            Customer.business_id == business_id,
            Customer.merged_into_customer_id.is_(None),
            Customer.anonymized_at.is_(None),
        )
        .group_by(Customer.id, Customer.name, Customer.email, Customer.phone)
        .order_by(Customer.name.nullslast(), Customer.created_at.desc())
    )
    visitors: list[dict[str, Any]] = []
    for row in rows.all():
        queue_count = await db.scalar(
            select(func.count()).select_from(QueueEntry).where(
                QueueEntry.business_id == business_id,
                QueueEntry.customer_id == row.id,
                QueueEntry.status.in_(("seated", "completed", "removed")),
            )
        )
        last_queue_visit = await db.scalar(
            select(func.max(func.coalesce(QueueEntry.completed_at, QueueEntry.seated_at, QueueEntry.joined_at))).where(
                QueueEntry.business_id == business_id, QueueEntry.customer_id == row.id
            )
        )
        last_visit = max(
            [value for value in (row.last_visit, last_queue_visit) if value is not None],
            default=None,
        )
        visitors.append({
            "id": str(row.id), "name": row.name, "email": row.email, "phone": row.phone,
            "source": "reservation", "visit_count": int(row.visit_count or 0) + int(queue_count or 0),
            "last_visit": last_visit, "party_size": None,
        })
    return visitors


async def get_customer_tags(db: AsyncSession, *, business_id: UUID, customer_id: UUID) -> list[CustomerTag]:
    return list((await db.execute(select(CustomerTag).where(
        CustomerTag.business_id == business_id, CustomerTag.customer_id == customer_id
    ).order_by(CustomerTag.name))).scalars().all())


async def get_guest_context(db: AsyncSession, *, business_id: UUID, customer_id: UUID | None) -> dict[str, Any] | None:
    if customer_id is None:
        return None
    customer = await get_customer_by_id(db, customer_id, business_id)
    if customer is None or customer.anonymized_at is not None:
        return None
    tags = await get_customer_tags(db, business_id=business_id, customer_id=customer.id)
    return {
        "customer_id": customer.id,
        "tags": [tag.name for tag in tags],
        "dietary_details": customer.dietary_details,
        "preferences": customer.preferences,
    }


async def get_customer_profile(db: AsyncSession, *, business_id: UUID, customer_id: UUID) -> dict[str, Any] | None:
    customer = await get_customer_by_id(db, customer_id, business_id)
    if customer is None:
        return None
    tags = await get_customer_tags(db, business_id=business_id, customer_id=customer_id)
    notes = list((await db.execute(select(CustomerNote).where(
        CustomerNote.business_id == business_id, CustomerNote.customer_id == customer_id
    ).order_by(CustomerNote.updated_at.desc()))).scalars().all())
    consents = list((await db.execute(select(CustomerMarketingConsent).where(
        CustomerMarketingConsent.business_id == business_id, CustomerMarketingConsent.customer_id == customer_id
    ).order_by(CustomerMarketingConsent.channel))).scalars().all())
    timeline = await _timeline(db, business_id=business_id, customer_id=customer_id, notes=notes)
    return {
        **_customer_dict(customer), "tags": tags, "notes": notes,
        "consents": consents, "timeline": timeline,
    }


def _customer_dict(customer: Customer) -> dict[str, Any]:
    return {column: getattr(customer, column) for column in (
        "id", "business_id", "name", "phone", "email", "date_of_birth", "preferences",
        "dietary_details", "dietary_details_source", "dietary_details_recorded_at",
        "anonymized_at", "merged_into_customer_id", "created_at", "updated_at",
    )}


async def _timeline(
    db: AsyncSession, *, business_id: UUID, customer_id: UUID, notes: list[CustomerNote]
) -> list[GuestTimelineEntry]:
    entries: list[GuestTimelineEntry] = []
    reservations = list((await db.execute(select(Reservation).where(
        Reservation.business_id == business_id, Reservation.customer_id == customer_id
    ))).scalars().all())
    entries.extend(GuestTimelineEntry(id=f"reservation:{item.id}", kind="reservation", occurred_at=item.time,
        title="Reservation", detail=f"Party of {item.guests}", status=item.status) for item in reservations)
    queues = list((await db.execute(select(QueueEntry).where(
        QueueEntry.business_id == business_id, QueueEntry.customer_id == customer_id
    ))).scalars().all())
    entries.extend(GuestTimelineEntry(id=f"queue:{item.id}", kind="queue", occurred_at=item.joined_at,
        title="Walk-in queue", detail=f"Party of {item.party_size}", status=item.status) for item in queues)
    tabs = list((await db.execute(select(Tab).where(
        Tab.business_id == business_id, Tab.customer_id == customer_id
    ))).scalars().all())
    for tab in tabs:
        total = await db.scalar(select(func.coalesce(func.sum(Order.total_amount), 0)).where(
            Order.tab_id == tab.id, Order.status != "cancelled"
        ))
        entries.append(GuestTimelineEntry(id=f"tab:{tab.id}", kind="tab", occurred_at=tab.closed_at or tab.opened_at,
            title="Settled tab" if tab.closed_at else "Open tab", detail=tab.settled_method, amount=total, status=tab.status))
    orders = list((await db.execute(select(Order).where(
        Order.business_id == business_id, Order.customer_id == customer_id
    ))).scalars().all())
    entries.extend(GuestTimelineEntry(id=f"order:{item.id}", kind="order", occurred_at=item.placed_at,
        title="Order", amount=item.total_amount, status=item.status) for item in orders)
    entries.extend(GuestTimelineEntry(id=f"note:{item.id}", kind="note", occurred_at=item.updated_at,
        title=item.title, detail=item.body) for item in notes)
    return sorted(entries, key=lambda item: item.occurred_at, reverse=True)


async def update_customer_profile(
    db: AsyncSession, *, customer: Customer, data: CustomerProfileUpdate, actor_id: UUID
) -> Customer:
    values = data.model_dump(exclude_unset=True)
    for field in ("name", "email", "date_of_birth", "preferences"):
        if field in values:
            setattr(customer, field, values[field])
    if "dietary_details" in values:
        if values.get("dietary_details"):
            if not data.save_dietary_details:
                raise ValueError("Confirm that the guest asked to save dietary details for future visits")
            customer.dietary_details = values["dietary_details"]
            customer.dietary_details_source = "guest_provided"
            customer.dietary_details_recorded_by = actor_id
            customer.dietary_details_recorded_at = datetime.now(timezone.utc)
        else:
            customer.dietary_details = None
            customer.dietary_details_source = None
            customer.dietary_details_recorded_by = None
            customer.dietary_details_recorded_at = None
    await db.flush()
    await db.refresh(customer)
    return customer


async def add_tag(db: AsyncSession, *, business_id: UUID, customer_id: UUID, name: str, actor_id: UUID) -> CustomerTag:
    existing = await db.scalar(select(CustomerTag).where(
        CustomerTag.business_id == business_id, CustomerTag.customer_id == customer_id, CustomerTag.name.ilike(name)
    ))
    if existing is not None:
        return existing
    tag = CustomerTag(business_id=business_id, customer_id=customer_id, name=name, created_by=actor_id)
    db.add(tag)
    await db.flush()
    return tag


async def remove_tag(db: AsyncSession, *, business_id: UUID, customer_id: UUID, tag_id: UUID) -> bool:
    tag = await db.scalar(select(CustomerTag).where(CustomerTag.id == tag_id, CustomerTag.business_id == business_id, CustomerTag.customer_id == customer_id))
    if tag is None:
        return False
    await db.delete(tag)
    await db.flush()
    return True


async def add_note(db: AsyncSession, *, business_id: UUID, customer_id: UUID, title: str, body: str, actor_id: UUID) -> CustomerNote:
    note = CustomerNote(business_id=business_id, customer_id=customer_id, title=title, body=body, created_by=actor_id, updated_by=actor_id)
    db.add(note)
    await db.flush()
    await db.refresh(note)
    return note


async def update_note(db: AsyncSession, *, business_id: UUID, customer_id: UUID, note_id: UUID, values: dict[str, Any], actor_id: UUID) -> CustomerNote | None:
    note = await db.scalar(select(CustomerNote).where(CustomerNote.id == note_id, CustomerNote.business_id == business_id, CustomerNote.customer_id == customer_id))
    if note is None:
        return None
    for field, value in values.items():
        setattr(note, field, value)
    note.updated_by = actor_id
    await db.flush()
    await db.refresh(note)
    return note


async def delete_note(db: AsyncSession, *, business_id: UUID, customer_id: UUID, note_id: UUID) -> bool:
    note = await db.scalar(select(CustomerNote).where(CustomerNote.id == note_id, CustomerNote.business_id == business_id, CustomerNote.customer_id == customer_id))
    if note is None:
        return False
    await db.delete(note)
    await db.flush()
    return True


async def record_public_marketing_consents(db: AsyncSession, *, customer_id: UUID, business_id: UUID, reservation_id: UUID, email_opt_in: bool, sms_opt_in: bool) -> None:
    now = datetime.now(timezone.utc)
    for channel, is_consented in (("email", email_opt_in), ("sms", sms_opt_in)):
        existing = await db.scalar(select(CustomerMarketingConsent).where(CustomerMarketingConsent.customer_id == customer_id, CustomerMarketingConsent.channel == channel))
        if existing is None:
            db.add(CustomerMarketingConsent(business_id=business_id, customer_id=customer_id, channel=channel, is_consented=is_consented, source="public_reservation", notice_version="eu-de-v1", reservation_id=reservation_id, captured_at=now, withdrawn_at=None if is_consented else now))
        else:
            existing.is_consented = is_consented
            existing.source = "public_reservation"
            existing.notice_version = "eu-de-v1"
            existing.reservation_id = reservation_id
            existing.captured_at = now
            existing.withdrawn_at = None if is_consented else now
    await db.flush()


async def merge_customers(db: AsyncSession, *, business_id: UUID, target: Customer, source_id: UUID, actor_id: UUID) -> Customer:
    source = await get_customer_by_id(db, source_id, business_id)
    if source is None or source.id == target.id:
        raise ValueError("Select a different active guest profile to merge")
    target_tag_names = list((await db.execute(select(CustomerTag.name).where(
        CustomerTag.business_id == business_id, CustomerTag.customer_id == target.id
    ))).scalars().all())
    if target_tag_names:
        await db.execute(delete(CustomerTag).where(
            CustomerTag.business_id == business_id,
            CustomerTag.customer_id == source.id,
            CustomerTag.name.in_(target_tag_names),
        ))
    target_consents = {
        consent.channel: consent
        for consent in (
            await db.scalars(
                select(CustomerMarketingConsent).where(
                    CustomerMarketingConsent.business_id == business_id,
                    CustomerMarketingConsent.customer_id == target.id,
                )
            )
        ).all()
    }
    source_consents = list(
        (
            await db.scalars(
                select(CustomerMarketingConsent).where(
                    CustomerMarketingConsent.business_id == business_id,
                    CustomerMarketingConsent.customer_id == source.id,
                )
            )
        ).all()
    )
    for source_consent in source_consents:
        target_consent = target_consents.get(source_consent.channel)
        if target_consent is None:
            source_consent.customer_id = target.id
            target_consents[source_consent.channel] = source_consent
            continue
        target_consent.is_consented = (
            target_consent.is_consented and source_consent.is_consented
        )
        if not target_consent.is_consented:
            target_consent.withdrawn_at = (
                target_consent.withdrawn_at
                or source_consent.withdrawn_at
                or datetime.now(timezone.utc)
            )
        await db.delete(source_consent)

    for model in (Reservation, QueueEntry, Tab, Order, CustomerTag, CustomerNote, CustomerDataRequest):
        await db.execute(update(model).where(model.business_id == business_id, model.customer_id == source.id).values(customer_id=target.id))
    if not target.name:
        target.name = source.name
    if not target.email:
        target.email = source.email
    if not target.preferences:
        target.preferences = source.preferences
    source.name = None
    source.email = None
    source.phone = None
    source.preferences = None
    source.dietary_details = None
    source.dietary_details_source = None
    source.dietary_details_recorded_at = None
    source.merged_into_customer_id = target.id
    source.anonymized_at = datetime.now(timezone.utc)
    db.add(CustomerMergeAudit(business_id=business_id, source_customer_id=source.id, target_customer_id=target.id, merged_by=actor_id))
    await db.flush()
    return target


async def anonymize_customer(db: AsyncSession, *, business_id: UUID, customer: Customer, actor_id: UUID | None, detail: str | None = None) -> CustomerDataRequest:
    now = datetime.now(timezone.utc)
    customer.name = None
    customer.phone = None
    customer.email = None
    customer.date_of_birth = None
    customer.preferences = None
    customer.dietary_details = None
    customer.dietary_details_source = None
    customer.dietary_details_recorded_by = None
    customer.dietary_details_recorded_at = None
    customer.anonymized_at = now
    await db.execute(delete(CustomerTag).where(CustomerTag.business_id == business_id, CustomerTag.customer_id == customer.id))
    await db.execute(delete(CustomerNote).where(CustomerNote.business_id == business_id, CustomerNote.customer_id == customer.id))
    await db.execute(delete(CustomerMarketingConsent).where(CustomerMarketingConsent.business_id == business_id, CustomerMarketingConsent.customer_id == customer.id))
    await db.execute(update(Reservation).where(Reservation.business_id == business_id, Reservation.customer_id == customer.id).values(phone=None, email=None, note=None))
    await db.execute(update(QueueEntry).where(QueueEntry.business_id == business_id, QueueEntry.customer_id == customer.id).values(phone=None, name="Deleted guest"))
    request = CustomerDataRequest(business_id=business_id, customer_id=customer.id, request_type="deletion", status="completed", detail=detail, requested_by=actor_id, completed_by=actor_id, completed_at=now)
    db.add(request)
    await db.flush()
    return request


async def export_customer_data(db: AsyncSession, *, business_id: UUID, customer_id: UUID, actor_id: UUID) -> dict[str, Any] | None:
    profile = await get_customer_profile(db, business_id=business_id, customer_id=customer_id)
    if profile is None:
        return None
    now = datetime.now(timezone.utc)
    db.add(CustomerDataRequest(business_id=business_id, customer_id=customer_id, request_type="export", status="completed", requested_by=actor_id, completed_by=actor_id, completed_at=now))
    await db.flush()
    return profile


async def anonymize_inactive_customers(db: AsyncSession, *, business_id: UUID | None = None, now: datetime | None = None) -> int:
    """Apply the documented 24-month inactivity policy; suitable for a daily job."""
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=730)
    query = select(Customer).where(
        Customer.anonymized_at.is_(None),
        Customer.merged_into_customer_id.is_(None),
    )
    if business_id is not None:
        query = query.where(Customer.business_id == business_id)
    customers = list((await db.execute(query)).scalars().all())
    anonymized = 0
    for customer in customers:
        reservation_activity = await db.scalar(
            select(func.max(func.coalesce(Reservation.updated_at, Reservation.time))).where(
                Reservation.business_id == customer.business_id,
                Reservation.customer_id == customer.id,
            )
        )
        queue_activity = await db.scalar(
            select(
                func.max(
                    func.coalesce(
                        QueueEntry.completed_at,
                        QueueEntry.seated_at,
                        QueueEntry.joined_at,
                    )
                )
            ).where(
                QueueEntry.business_id == customer.business_id,
                QueueEntry.customer_id == customer.id,
            )
        )
        tab_activity = await db.scalar(
            select(func.max(func.coalesce(Tab.closed_at, Tab.opened_at))).where(
                Tab.business_id == customer.business_id,
                Tab.customer_id == customer.id,
            )
        )
        order_activity = await db.scalar(
            select(func.max(Order.placed_at)).where(
                Order.business_id == customer.business_id,
                Order.customer_id == customer.id,
            )
        )
        last_activity = max(
            (
                activity
                for activity in (
                    customer.created_at,
                    reservation_activity,
                    queue_activity,
                    tab_activity,
                    order_activity,
                )
                if activity is not None
            ),
        )
        if last_activity >= cutoff:
            continue
        await anonymize_customer(
            db,
            business_id=customer.business_id,
            customer=customer,
            actor_id=None,
            detail="24-month inactivity policy",
        )
        anonymized += 1
    return anonymized
