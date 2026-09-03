"""Menus own their own activation windows.

Two things are worth defending here and neither had coverage before migration
051. First, the midnight-wrap rule moved from the deleted happy_hour_service
into menu_activation_service and must still hold. Second — the reason this is
not merely a presentation change — hiding a closed menu from a guest is not a
guard: a page loaded before the window shut can still POST an item id from it,
so placement has to reject it.
"""

from datetime import datetime, time, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.menu import Menu, MenuActivationWindow, MenuCategory, MenuItem
from app.models.order import Order
from app.schemas.order import OrderPlaceRequest
from app.services import menu_activation_service, menu_service, order_service, tax_service


async def _venue(db: AsyncSession, suffix: str, *, tz: str = "Europe/Berlin"):
    """A business with one always-on menu and one windowed menu, each with an item."""
    business = Business(
        name=f"Activation {suffix}",
        slug=f"activation-{suffix}",
        email=f"activation-{suffix}@example.com",
        phone="+4915112345678",
        enabled_modules=["ordering"],
        timezone=tz,
    )
    db.add(business)
    await db.flush()
    profiles = await tax_service.create_default_profiles(db, business)

    menus = {}
    for key, name in (("always", "Classic Menu"), ("windowed", "Happy Hour")):
        menu = Menu(business_id=business.id, name=name, is_active=True)
        db.add(menu)
        await db.flush()
        category = MenuCategory(
            menu_id=menu.id, business_id=business.id, name="Drinks", is_active=True
        )
        db.add(category)
        await db.flush()
        item = MenuItem(
            category_id=category.id,
            business_id=business.id,
            name=f"{name} Soda",
            price=Decimal("10.00"),
            tax_profile_id=profiles[0].id,
            is_available=True,
            routing_tag="bar",
        )
        db.add(item)
        await db.flush()
        menus[key] = (menu, item)
    return business, menus


def _place(item: MenuItem, *, key: str) -> OrderPlaceRequest:
    return OrderPlaceRequest.model_validate(
        {
            "items": [{"item_id": item.id, "quantity": 1, "selected_modifiers": []}],
            "idempotency_key": key,
        }
    )


# ─── The moved midnight-wrap rule ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_overnight_window_wraps_past_midnight(db_session: AsyncSession):
    """Friday 22:00-02:00, with only Friday listed, runs into Saturday.

    This is the rule that moved out of happy_hour_service.is_happy_hour_active.
    It is active Friday 22:00-23:59:59 and Saturday 00:00-02:00 even though
    Saturday is not in days_of_week.
    """
    business, menus = await _venue(db_session, "overnight", tz="UTC")
    menu, _ = menus["windowed"]
    db_session.add(
        MenuActivationWindow(
            menu_id=menu.id,
            business_id=business.id,
            days_of_week=[4],  # Friday only (0=Monday..6=Sunday)
            start_time=time(22, 0),
            end_time=time(2, 0),
            is_active=True,
        )
    )
    await db_session.flush()

    async def active_at(dt: datetime) -> bool:
        return menu.id in await menu_activation_service.active_menu_ids(
            db_session, business.id, dt
        )

    # 2026-09-04 is a Friday; 2026-09-05 a Saturday.
    assert await active_at(datetime(2026, 9, 4, 22, 30, tzinfo=timezone.utc))
    assert await active_at(datetime(2026, 9, 4, 23, 59, tzinfo=timezone.utc))
    assert await active_at(datetime(2026, 9, 5, 0, 30, tzinfo=timezone.utc))
    assert await active_at(datetime(2026, 9, 5, 1, 59, tzinfo=timezone.utc))
    # Outside both segments.
    assert not await active_at(datetime(2026, 9, 4, 21, 59, tzinfo=timezone.utc))
    assert not await active_at(datetime(2026, 9, 5, 2, 1, tzinfo=timezone.utc))
    # Saturday night is NOT covered — only Friday is listed.
    assert not await active_at(datetime(2026, 9, 5, 22, 30, tzinfo=timezone.utc))


@pytest.mark.asyncio
async def test_same_day_window_matches_only_inside_its_hours(db_session: AsyncSession):
    business, menus = await _venue(db_session, "sameday", tz="UTC")
    menu, _ = menus["windowed"]
    db_session.add(
        MenuActivationWindow(
            menu_id=menu.id,
            business_id=business.id,
            days_of_week=[4],
            start_time=time(17, 0),
            end_time=time(20, 0),
            is_active=True,
        )
    )
    await db_session.flush()

    async def active_at(dt):
        return menu.id in await menu_activation_service.active_menu_ids(
            db_session, business.id, dt
        )

    assert await active_at(datetime(2026, 9, 4, 18, 0, tzinfo=timezone.utc))
    assert not await active_at(datetime(2026, 9, 4, 16, 59, tzinfo=timezone.utc))
    assert not await active_at(datetime(2026, 9, 4, 20, 1, tzinfo=timezone.utc))
    # Thursday, not a listed day.
    assert not await active_at(datetime(2026, 9, 3, 18, 0, tzinfo=timezone.utc))


@pytest.mark.asyncio
async def test_window_is_read_in_the_venue_timezone_not_utc(db_session: AsyncSession):
    """17:00-20:00 means the venue's wall clock.

    In Europe/Berlin (UTC+2 in September) 16:00 UTC is 18:00 local and inside
    the window; 20:30 UTC is 22:30 local and outside it. Reading these as UTC
    would invert both answers.
    """
    business, menus = await _venue(db_session, "tz", tz="Europe/Berlin")
    menu, _ = menus["windowed"]
    db_session.add(
        MenuActivationWindow(
            menu_id=menu.id,
            business_id=business.id,
            days_of_week=[0, 1, 2, 3, 4, 5, 6],
            start_time=time(17, 0),
            end_time=time(20, 0),
            is_active=True,
        )
    )
    await db_session.flush()

    inside = await menu_activation_service.active_menu_ids(
        db_session, business.id, datetime(2026, 9, 4, 16, 0, tzinfo=timezone.utc)
    )
    outside = await menu_activation_service.active_menu_ids(
        db_session, business.id, datetime(2026, 9, 4, 20, 30, tzinfo=timezone.utc)
    )
    assert menu.id in inside
    assert menu.id not in outside


@pytest.mark.asyncio
async def test_menu_without_windows_is_always_on(db_session: AsyncSession):
    business, menus = await _venue(db_session, "always", tz="UTC")
    always, _ = menus["always"]
    windowed, _ = menus["windowed"]
    db_session.add(
        MenuActivationWindow(
            menu_id=windowed.id,
            business_id=business.id,
            days_of_week=[4],
            start_time=time(17, 0),
            end_time=time(20, 0),
            is_active=True,
        )
    )
    await db_session.flush()

    # A moment no window covers: the always-on menu still appears, alone.
    active = await menu_activation_service.active_menu_ids(
        db_session, business.id, datetime(2026, 9, 4, 3, 0, tzinfo=timezone.utc)
    )
    assert active == {always.id}


@pytest.mark.asyncio
async def test_deactivated_window_is_ignored_and_closes_its_menu(
    db_session: AsyncSession,
):
    """is_active=False on the only window does not make the menu always-on."""
    business, menus = await _venue(db_session, "inactive", tz="UTC")
    menu, _ = menus["windowed"]
    db_session.add(
        MenuActivationWindow(
            menu_id=menu.id,
            business_id=business.id,
            days_of_week=[0, 1, 2, 3, 4, 5, 6],
            start_time=time(17, 0),
            end_time=time(20, 0),
            is_active=False,
        )
    )
    await db_session.flush()

    active = await menu_activation_service.active_menu_ids(
        db_session, business.id, datetime(2026, 9, 4, 18, 0, tzinfo=timezone.utc)
    )
    assert menu.id not in active


@pytest.mark.asyncio
async def test_inactive_menu_never_appears_even_inside_its_window(
    db_session: AsyncSession,
):
    business, menus = await _venue(db_session, "offmenu", tz="UTC")
    menu, _ = menus["windowed"]
    menu.is_active = False
    db_session.add(
        MenuActivationWindow(
            menu_id=menu.id,
            business_id=business.id,
            days_of_week=[0, 1, 2, 3, 4, 5, 6],
            start_time=time(0, 1),
            end_time=time(23, 59),
            is_active=True,
        )
    )
    await db_session.flush()

    active = await menu_activation_service.active_menu_ids(
        db_session, business.id, datetime(2026, 9, 4, 18, 0, tzinfo=timezone.utc)
    )
    assert menu.id not in active


# ─── The public read hides a closed menu ──────────────────────────────────────

@pytest.mark.asyncio
async def test_public_read_omits_a_menu_outside_its_window(db_session: AsyncSession):
    business, menus = await _venue(db_session, "publicread", tz="UTC")
    always, _ = menus["always"]
    windowed, _ = menus["windowed"]
    db_session.add(
        MenuActivationWindow(
            menu_id=windowed.id,
            business_id=business.id,
            days_of_week=[0, 1, 2, 3, 4, 5, 6],
            start_time=time(17, 0),
            end_time=time(20, 0),
            is_active=True,
        )
    )
    await db_session.flush()

    inside = await menu_service.get_active_menus(
        db_session, business.id, datetime(2026, 9, 4, 18, 0, tzinfo=timezone.utc)
    )
    outside = await menu_service.get_active_menus(
        db_session, business.id, datetime(2026, 9, 4, 22, 0, tzinfo=timezone.utc)
    )
    assert {m.id for m in inside} == {always.id, windowed.id}
    assert {m.id for m in outside} == {always.id}


# ─── The guard: placement rejects a closed menu ───────────────────────────────

@pytest.mark.asyncio
async def test_placing_an_order_from_a_closed_menu_is_rejected(
    db_session: AsyncSession, monkeypatch
):
    """The negative case. Hiding the menu client-side is not a guard.

    A guest holding a page loaded before the window closed can still POST an
    item id from it, so placement asks the same question the public read asks —
    and nothing is written when the answer is no.
    """
    business, menus = await _venue(db_session, "closed", tz="UTC")
    windowed, closed_item = menus["windowed"]
    db_session.add(
        MenuActivationWindow(
            menu_id=windowed.id,
            business_id=business.id,
            days_of_week=[0, 1, 2, 3, 4, 5, 6],
            start_time=time(17, 0),
            end_time=time(20, 0),
            is_active=True,
        )
    )
    await db_session.flush()

    # Freeze placement outside the window.
    class _Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 9, 4, 23, 0, tzinfo=timezone.utc)

    monkeypatch.setattr(
        "app.services.menu_activation_service.datetime", _Frozen
    )

    before = await db_session.scalar(select(func.count()).select_from(Order))
    with pytest.raises(order_service.OrderValidationError):
        await order_service.place_order(
            db_session,
            business_id=business.id,
            request=_place(closed_item, key="closed-window"),
            channel="customer",
        )
    after = await db_session.scalar(select(func.count()).select_from(Order))
    assert after == before, "a rejected order must leave nothing behind"


@pytest.mark.asyncio
async def test_the_same_item_places_fine_inside_the_window(
    db_session: AsyncSession, monkeypatch
):
    """The positive twin, so the rejection above is provably about the window."""
    business, menus = await _venue(db_session, "open", tz="UTC")
    windowed, item = menus["windowed"]
    db_session.add(
        MenuActivationWindow(
            menu_id=windowed.id,
            business_id=business.id,
            days_of_week=[0, 1, 2, 3, 4, 5, 6],
            start_time=time(17, 0),
            end_time=time(20, 0),
            is_active=True,
        )
    )
    await db_session.flush()

    class _Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 9, 4, 18, 0, tzinfo=timezone.utc)

    monkeypatch.setattr(
        "app.services.menu_activation_service.datetime", _Frozen
    )

    order, created = await order_service.place_order(
        db_session,
        business_id=business.id,
        request=_place(item, key="open-window"),
        channel="customer",
    )
    assert created
    assert order.line_items[0].unit_price == Decimal("10.00")


@pytest.mark.asyncio
async def test_an_always_on_menu_is_orderable_at_any_hour(db_session: AsyncSession):
    business, menus = await _venue(db_session, "anyhour", tz="UTC")
    _, item = menus["always"]
    windowed, _ = menus["windowed"]
    db_session.add(
        MenuActivationWindow(
            menu_id=windowed.id,
            business_id=business.id,
            days_of_week=[4],
            start_time=time(17, 0),
            end_time=time(20, 0),
            is_active=True,
        )
    )
    await db_session.flush()

    order, created = await order_service.place_order(
        db_session,
        business_id=business.id,
        request=_place(item, key="always-on"),
        channel="customer",
    )
    assert created
    assert order.line_items[0].unit_price == Decimal("10.00")
