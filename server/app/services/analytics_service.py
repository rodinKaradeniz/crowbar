from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.days import DAY_ABBREVIATIONS
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

    # Daily breakdown by day of week and service type
    # Get last 7 days, map to day names (Mon-Sun)
    day_names = DAY_ABBREVIATIONS  # 0=Monday..6=Sunday (see app.constants.days)
    daily_by_type = []
    
    # Create a map of service type ID to name and color
    service_type_map = {str(st.id): {"name": st.name, "color": st.color} for st in service_types}
    
    # Group reservations by day of week
    for day_offset in range(7):
        day_start = seven_days_ago + timedelta(days=day_offset)
        day_end = day_start + timedelta(days=1)
        
        # Get day name (0 = Monday, 6 = Sunday)
        day_of_week = day_start.weekday()  # 0 = Monday, 6 = Sunday
        day_name = day_names[day_of_week]
        
        # Get reservations for this day
        day_reservations = [
            r for r in last_7_reservations
            if day_start <= r.time < day_end and r.status != "cancelled"
        ]
        
        # Count by service type
        day_data = {"day": day_name}
        for st in service_types:
            count = sum(
                1
                for r in day_reservations
                if r.service_type_id == st.id
            )
            day_data[st.name] = count
        
        daily_by_type.append(day_data)

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
        "daily_by_type": daily_by_type,
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


async def get_reservation_kpis(db: AsyncSession, business_id: UUID) -> dict:
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    result = await db.execute(
        select(Reservation.status, func.count().label("cnt")).where(
            Reservation.business_id == business_id,
            Reservation.time >= thirty_days_ago,
            Reservation.status.in_(["completed", "cancelled"]),
        ).group_by(Reservation.status)
    )
    counts = {row.status: row.cnt for row in result.all()}
    completed = counts.get("completed", 0)
    cancelled = counts.get("cancelled", 0)
    resolved = completed + cancelled
    cancellation_rate = round(cancelled / resolved, 4) if resolved else 0.0
    completion_rate = round(completed / resolved, 4) if resolved else 0.0

    lead_result = await db.execute(
        select(
            func.avg(
                func.extract("epoch", Reservation.time - Reservation.created_at) / 3600
            ).label("avg_hours")
        ).where(
            Reservation.business_id == business_id,
            Reservation.status == "completed",
            Reservation.time >= thirty_days_ago,
        )
    )
    avg_lead = lead_result.scalar() or 0.0

    hour_result = await db.execute(
        select(
            func.extract("hour", Reservation.time).label("hour"),
            func.count().label("count"),
        ).where(
            Reservation.business_id == business_id,
            Reservation.time >= thirty_days_ago,
            Reservation.status != "cancelled",
        ).group_by(func.extract("hour", Reservation.time)).order_by("hour")
    )
    occupancy_by_hour = [
        {"hour": int(row.hour), "count": row.count} for row in hour_result.all()
    ]

    return {
        "cancellation_rate": cancellation_rate,
        "completion_rate": completion_rate,
        "avg_lead_time_hours": round(float(avg_lead), 1),
        "occupancy_by_hour": occupancy_by_hour,
    }


async def get_ordering_kpis(db: AsyncSession, business_id: UUID) -> dict | None:
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    order_count_result = await db.execute(
        text("SELECT COUNT(*) FROM orders WHERE business_id = :bid AND placed_at >= :since"),
        {"bid": str(business_id), "since": thirty_days_ago},
    )
    if (order_count_result.scalar() or 0) == 0:
        return None

    prep_result = await db.execute(
        text("""
            SELECT AVG(EXTRACT(EPOCH FROM (ready_time - received_time)) / 60)
            FROM (
                SELECT
                    o.id,
                    MIN(CASE WHEN t.status = 'received' THEN t.changed_at END) AS received_time,
                    MIN(CASE WHEN t.status = 'ready' THEN t.changed_at END) AS ready_time
                FROM orders o
                JOIN order_status_timeline t ON t.order_id = o.id
                WHERE o.business_id = :bid
                  AND o.placed_at >= :since
                GROUP BY o.id
            ) sub
            WHERE received_time IS NOT NULL AND ready_time IS NOT NULL
        """),
        {"bid": str(business_id), "since": thirty_days_ago},
    )
    avg_prep = prep_result.scalar() or 0.0

    peak_result = await db.execute(
        text("""
            SELECT EXTRACT(HOUR FROM placed_at)::int AS hour, COUNT(*) AS count
            FROM orders
            WHERE business_id = :bid AND placed_at >= :since
            GROUP BY hour
            ORDER BY count DESC
            LIMIT 5
        """),
        {"bid": str(business_id), "since": thirty_days_ago},
    )
    peak_hours = [{"hour": row.hour, "count": row.count} for row in peak_result.all()]

    items_result = await db.execute(
        text("""
            SELECT li.item_name, SUM(li.quantity) AS total_ordered
            FROM order_line_items li
            JOIN orders o ON o.id = li.order_id
            WHERE o.business_id = :bid AND o.placed_at >= :since
            GROUP BY li.item_name
            ORDER BY total_ordered DESC
            LIMIT 5
        """),
        {"bid": str(business_id), "since": thirty_days_ago},
    )
    top_items = [
        {"name": row.item_name, "total_ordered": int(row.total_ordered)}
        for row in items_result.all()
    ]

    return {
        "avg_prep_time_minutes": round(float(avg_prep), 1),
        "peak_hours": peak_hours,
        "top_items": top_items,
    }


async def get_inventory_kpis(db: AsyncSession, business_id: UUID) -> dict | None:
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    item_count_result = await db.execute(
        text("SELECT COUNT(*) FROM inventory_items WHERE business_id = :bid"),
        {"bid": str(business_id)},
    )
    if (item_count_result.scalar() or 0) == 0:
        return None

    movements_result = await db.execute(
        text("""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE movement_type = 'waste') AS waste_count,
                COUNT(*) FILTER (WHERE alert_triggered = true) AS low_stock_incidents
            FROM stock_movements
            WHERE business_id = :bid AND created_at >= :since
        """),
        {"bid": str(business_id), "since": thirty_days_ago},
    )
    row = movements_result.one()

    below_par_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM inventory_items
            WHERE business_id = :bid
              AND par_quantity IS NOT NULL
              AND current_quantity < par_quantity
        """),
        {"bid": str(business_id)},
    )
    items_below_par = below_par_result.scalar() or 0

    return {
        "total_movements": int(row.total),
        "waste_movements": int(row.waste_count),
        "low_stock_incidents": int(row.low_stock_incidents),
        "items_below_par": int(items_below_par),
    }


async def get_high_risk_reservations(db: AsyncSession, business_id: UUID) -> list[dict]:
    result = await db.execute(
        text("""
            SELECT
                r.id,
                r.time,
                r.guests,
                r.status,
                r.customer_id,
                r.service_type_id,
                (p.prediction->>'cancellation_probability')::float AS risk_score
            FROM ml_predictions p
            JOIN reservations r ON r.id = p.entity_id
            WHERE p.business_id = :bid
              AND p.model_name = 'cancellation'
              AND p.entity_type = 'reservation'
              AND r.status = 'confirmed'
              AND r.time > NOW()
              AND (p.prediction->>'cancellation_probability')::float > 0.6
            ORDER BY risk_score DESC
            LIMIT 10
        """),
        {"bid": str(business_id)},
    )
    return [
        {
            "id": str(row.id),
            "time": row.time.isoformat(),
            "guests": row.guests,
            "status": row.status,
            "customer_id": str(row.customer_id),
            "service_type_id": str(row.service_type_id),
            "risk_score": round(row.risk_score, 3),
        }
        for row in result.all()
    ]
