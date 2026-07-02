from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.happy_hour_window import HappyHourWindow
from app.schemas.happy_hour import HappyHourWindowCreate, HappyHourWindowUpdate


async def _business_timezone(db: AsyncSession, business_id: UUID) -> str:
    result = await db.execute(
        select(Business.timezone).where(Business.id == business_id)
    )
    tz = result.scalar_one_or_none()
    return tz or "UTC"


async def is_happy_hour_active(
    db: AsyncSession,
    business_id: UUID,
    at: datetime | None = None,
) -> bool:
    """Return True if any active happy-hour window covers ``at`` for the business.

    ``at`` is converted to the business's IANA timezone, then day-of-week and
    time-of-day are matched against every active window. This is the single
    source of truth used by both the public menu read path and order placement,
    so the price a customer sees and the price actually charged cannot disagree.

    A window is same-day when ``start_time <= end_time`` and matches when the
    local weekday is listed and ``start_time <= t <= end_time``. A window with
    ``start_time > end_time`` wraps past midnight and is active in two segments:
    on a listed day from ``start_time`` until midnight, and on the day *after* a
    listed day from midnight until ``end_time``. So a Friday 22:00–02:00 window
    is active Friday 22:00–23:59:59 and Saturday 00:00–02:00, even though only
    Friday is listed in ``days_of_week``.
    """
    if at is None:
        at = datetime.now(timezone.utc)
    elif at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)

    tz_name = await _business_timezone(db, business_id)
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError):
        tz = ZoneInfo("UTC")

    local = at.astimezone(tz)
    weekday = local.weekday()  # 0=Monday..6=Sunday (see app.constants.days)
    local_time = local.time()

    result = await db.execute(
        select(HappyHourWindow).where(
            HappyHourWindow.business_id == business_id,
            HappyHourWindow.is_active == True,  # noqa: E712
        )
    )
    windows = result.scalars().all()

    prev_weekday = (weekday - 1) % 7  # 0=Monday..6=Sunday (see app.constants.days)
    for w in windows:
        days = w.days_of_week or []
        if w.start_time <= w.end_time:
            # Same-day window.
            if weekday in days and w.start_time <= local_time <= w.end_time:
                return True
        else:
            # Overnight window (wraps past midnight): active from start_time until
            # midnight on a listed day, and from midnight until end_time on the
            # following day.
            if (weekday in days and local_time >= w.start_time) or (
                prev_weekday in days and local_time <= w.end_time
            ):
                return True
    return False


# ─── Window CRUD (all business-scoped) ────────────────────────────────────────

async def list_windows(db: AsyncSession, business_id: UUID) -> list[HappyHourWindow]:
    result = await db.execute(
        select(HappyHourWindow)
        .where(HappyHourWindow.business_id == business_id)
        .order_by(HappyHourWindow.created_at)
    )
    return list(result.scalars().all())


async def get_window(
    db: AsyncSession, window_id: UUID, business_id: UUID
) -> HappyHourWindow | None:
    result = await db.execute(
        select(HappyHourWindow).where(
            HappyHourWindow.id == window_id,
            HappyHourWindow.business_id == business_id,
        )
    )
    return result.scalar_one_or_none()


async def create_window(
    db: AsyncSession, business_id: UUID, data: HappyHourWindowCreate
) -> HappyHourWindow:
    window = HappyHourWindow(
        business_id=business_id,
        name=data.name,
        days_of_week=data.days_of_week,
        start_time=data.start_time,
        end_time=data.end_time,
        is_active=data.is_active,
    )
    db.add(window)
    await db.flush()
    await db.refresh(window)
    return window


async def update_window(
    db: AsyncSession,
    window_id: UUID,
    business_id: UUID,
    data: HappyHourWindowUpdate,
) -> HappyHourWindow | None:
    window = await get_window(db, window_id, business_id)
    if window is None:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(window, key, value)
    await db.flush()
    await db.refresh(window)
    return window


async def delete_window(
    db: AsyncSession, window_id: UUID, business_id: UUID
) -> bool:
    window = await get_window(db, window_id, business_id)
    if window is None:
        return False
    await db.delete(window)
    await db.flush()
    return True
