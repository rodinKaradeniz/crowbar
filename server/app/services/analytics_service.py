from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reservation import Reservation
from app.models.service_type import ServiceType


async def get_business_dashboard_stats(db: AsyncSession, business_id: UUID) -> dict:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    sixty_days_ago = now - timedelta(days=60)

    # Today's reservations
    today_result = await db.execute(
        select(Reservation).where(
            Reservation.business_id == business_id,
            Reservation.time >= today_start,
            Reservation.time < today_end,
            Reservation.status != "cancelled",
        )
    )
    today_reservations = list(today_result.scalars().all())

    # Pending requests
    pending_result = await db.execute(
        select(func.count()).where(
            Reservation.business_id == business_id,
            Reservation.status == "pending",
        )
    )
    pending_count = pending_result.scalar() or 0

    # Today's guest count
    today_guest_count = sum(r.guests for r in today_reservations)

    # Last 7 days status breakdown
    last_7_result = await db.execute(
        select(Reservation).where(
            Reservation.business_id == business_id,
            Reservation.time >= seven_days_ago,
        )
    )
    last_7_reservations = list(last_7_result.scalars().all())

    status_breakdown = {
        "confirmed": sum(1 for r in last_7_reservations if r.status == "confirmed"),
        "pending": sum(1 for r in last_7_reservations if r.status == "pending"),
        "cancelled": sum(1 for r in last_7_reservations if r.status == "cancelled"),
        "completed": sum(1 for r in last_7_reservations if r.status == "completed"),
    }

    # Reservations by service type
    service_types_result = await db.execute(
        select(ServiceType).where(ServiceType.business_id == business_id)
    )
    service_types = list(service_types_result.scalars().all())

    reservations_by_type = []
    for st in service_types:
        count = sum(
            1
            for r in last_7_reservations
            if r.service_type_id == st.id
        )
        reservations_by_type.append(
            {"name": st.name, "color": st.color, "count": count}
        )

    # Upcoming reservations
    upcoming_result = await db.execute(
        select(Reservation)
        .where(
            Reservation.business_id == business_id,
            Reservation.time >= now,
            Reservation.status != "cancelled",
        )
        .order_by(Reservation.time)
        .limit(5)
    )
    upcoming = list(upcoming_result.scalars().all())

    # Month-over-month change
    this_month_result = await db.execute(
        select(func.count()).where(
            Reservation.business_id == business_id,
            Reservation.time >= thirty_days_ago,
            Reservation.status != "cancelled",
        )
    )
    this_month_count = this_month_result.scalar() or 0

    last_month_result = await db.execute(
        select(func.count()).where(
            Reservation.business_id == business_id,
            Reservation.time >= sixty_days_ago,
            Reservation.time < thirty_days_ago,
            Reservation.status != "cancelled",
        )
    )
    last_month_count = last_month_result.scalar() or 0

    month_change = (
        100
        if last_month_count == 0
        else round(((this_month_count - last_month_count) / last_month_count) * 100)
    )

    return {
        "today_reservations": len(today_reservations),
        "pending_requests": pending_count,
        "today_guest_count": today_guest_count,
        "status_breakdown": status_breakdown,
        "reservations_by_type": reservations_by_type,
        "upcoming_reservations": [
            {
                "id": str(r.id),
                "time": r.time.isoformat(),
                "guests": r.guests,
                "status": r.status,
                "service_type_id": str(r.service_type_id),
                "customer_id": str(r.customer_id),
            }
            for r in upcoming
        ],
        "month_change": month_change,
    }


async def get_customer_dashboard_stats(db: AsyncSession, customer_id: UUID) -> dict:
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(Reservation).where(Reservation.customer_id == customer_id)
    )
    reservations = list(result.scalars().all())

    status_breakdown = {
        "confirmed": sum(1 for r in reservations if r.status == "confirmed"),
        "pending": sum(1 for r in reservations if r.status == "pending"),
        "cancelled": sum(1 for r in reservations if r.status == "cancelled"),
        "completed": sum(1 for r in reservations if r.status == "completed"),
    }

    upcoming = sorted(
        [r for r in reservations if r.time >= now and r.status != "cancelled"],
        key=lambda r: r.time,
    )[:3]

    return {
        "total_reservations": len(reservations),
        "status_breakdown": status_breakdown,
        "upcoming_reservations": [
            {
                "id": str(r.id),
                "time": r.time.isoformat(),
                "guests": r.guests,
                "status": r.status,
                "business_id": str(r.business_id),
                "service_type_id": str(r.service_type_id),
            }
            for r in upcoming
        ],
    }
