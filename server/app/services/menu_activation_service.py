from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.menu import Menu, MenuActivationWindow
from app.schemas.menu import MenuActivationWindowCreate, MenuActivationWindowUpdate


async def _business_timezone(db: AsyncSession, business_id: UUID) -> str:
    result = await db.execute(
        select(Business.timezone).where(Business.id == business_id)
    )
    tz = result.scalar_one_or_none()
    return tz or "UTC"


def _window_covers(window: MenuActivationWindow, weekday: int, local_time) -> bool:
    """Whether one window covers a local weekday and time-of-day.

    A window is same-day when ``start_time <= end_time`` and matches when the
    local weekday is listed and ``start_time <= t <= end_time``. A window with
    ``start_time > end_time`` wraps past midnight and is active in two segments:
    on a listed day from ``start_time`` until midnight, and on the day *after* a
    listed day from midnight until ``end_time``. So a Friday 22:00-02:00 window
    is active Friday 22:00-23:59:59 and Saturday 00:00-02:00, even though only
    Friday is listed in ``days_of_week``.
    """
    days = window.days_of_week or []
    prev_weekday = (weekday - 1) % 7  # 0=Monday..6=Sunday (see app.constants.days)
    if window.start_time <= window.end_time:
        # Same-day window.
        return weekday in days and window.start_time <= local_time <= window.end_time
    # Overnight window (wraps past midnight): active from start_time until
    # midnight on a listed day, and from midnight until end_time on the
    # following day.
    return (weekday in days and local_time >= window.start_time) or (
        prev_weekday in days and local_time <= window.end_time
    )


async def active_menu_ids(
    db: AsyncSession,
    business_id: UUID,
    at: datetime | None = None,
) -> set[UUID]:
    """The ids of the business's menus that are being served at ``at``.

    A menu must be ``is_active`` to appear at all. Beyond that it is either
    *always on* — it has no activation windows whatsoever — or it is scheduled,
    and then it is served only while one of its active windows covers now.

    ``at`` is converted to the business's IANA timezone before any day-of-week
    or time-of-day comparison, so a window means the venue's wall clock and
    never UTC.

    This is the single source of truth for both the public menu read path and
    order placement, so a menu a guest cannot see is also a menu they cannot
    order from, and the price shown and the price charged cannot disagree.
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

    menu_ids = set(
        (
            await db.scalars(
                select(Menu.id).where(
                    Menu.business_id == business_id,
                    Menu.is_active.is_(True),
                )
            )
        ).all()
    )
    if not menu_ids:
        return set()

    # Every window, active or not: whether a menu is SCHEDULED is decided by
    # having any window at all, while only an active one can open it. Reading
    # is_active into the first question would mean switching a schedule off made
    # its menu permanently available, which is backwards — a menu that should
    # always be on says so through menus.is_active, not by having its only
    # window disabled.
    windows = (
        await db.scalars(
            select(MenuActivationWindow).where(
                MenuActivationWindow.business_id == business_id,
            )
        )
    ).all()

    scheduled: set[UUID] = set()
    covered: set[UUID] = set()
    for window in windows:
        if window.menu_id not in menu_ids:
            continue
        scheduled.add(window.menu_id)
        if window.is_active and _window_covers(window, weekday, local_time):
            covered.add(window.menu_id)

    # A menu with no windows at all is always on; a scheduled menu is served
    # only while one of its active windows covers the venue's local clock.
    return (menu_ids - scheduled) | covered


# ─── Window CRUD (menu- and business-scoped) ──────────────────────────────────

async def _owned_menu_id(
    db: AsyncSession, menu_id: UUID, business_id: UUID
) -> UUID | None:
    return await db.scalar(
        select(Menu.id).where(Menu.id == menu_id, Menu.business_id == business_id)
    )


async def list_windows(
    db: AsyncSession, menu_id: UUID, business_id: UUID
) -> list[MenuActivationWindow]:
    result = await db.execute(
        select(MenuActivationWindow)
        .where(
            MenuActivationWindow.menu_id == menu_id,
            MenuActivationWindow.business_id == business_id,
        )
        .order_by(MenuActivationWindow.created_at)
    )
    return list(result.scalars().all())


async def get_window(
    db: AsyncSession, window_id: UUID, menu_id: UUID, business_id: UUID
) -> MenuActivationWindow | None:
    result = await db.execute(
        select(MenuActivationWindow).where(
            MenuActivationWindow.id == window_id,
            MenuActivationWindow.menu_id == menu_id,
            MenuActivationWindow.business_id == business_id,
        )
    )
    return result.scalar_one_or_none()


async def create_window(
    db: AsyncSession,
    menu_id: UUID,
    business_id: UUID,
    data: MenuActivationWindowCreate,
) -> MenuActivationWindow | None:
    if await _owned_menu_id(db, menu_id, business_id) is None:
        return None
    window = MenuActivationWindow(
        menu_id=menu_id,
        business_id=business_id,
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
    menu_id: UUID,
    business_id: UUID,
    data: MenuActivationWindowUpdate,
) -> MenuActivationWindow | None:
    window = await get_window(db, window_id, menu_id, business_id)
    if window is None:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(window, key, value)
    await db.flush()
    await db.refresh(window)
    return window


async def delete_window(
    db: AsyncSession, window_id: UUID, menu_id: UUID, business_id: UUID
) -> bool:
    window = await get_window(db, window_id, menu_id, business_id)
    if window is None:
        return False
    await db.delete(window)
    await db.flush()
    return True
