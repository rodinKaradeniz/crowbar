from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.menu import ItemLibrary, Menu, MenuCategory, MenuItem, MenuItemAvailabilityEvent, Modifier, ModifierGroup
from app.services import preparation_station_service
from app.models.tax import TaxProfile
from app.schemas.menu import (
    LibraryItemCreate,
    LibraryItemUpdate,
    MenuCategoryCreate,
    MenuCategoryUpdate,
    MenuCreate,
    MenuItemCreate,
    MenuItemUpdate,
    MenuUpdate,
    ModifierCreate,
    ModifierGroupCreate,
)
from app.services import tax_service


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _resolve_tax_profile_id(
    db: AsyncSession, business_id: UUID, requested_id: UUID | None
) -> UUID:
    if requested_id is None:
        raise tax_service.TaxProfileError(
            "Choose an explicit tax profile before adding a priced item"
        )
    profile_id = requested_id
    await tax_service.resolve_profile_version(
        db, business_id, profile_id, datetime.now(timezone.utc)
    )
    return profile_id

async def _load_menu(db: AsyncSession, menu_id: UUID, business_id: UUID) -> Menu | None:
    result = await db.execute(
        select(Menu)
        .where(Menu.id == menu_id, Menu.business_id == business_id)
        .options(
            selectinload(Menu.categories)
            .selectinload(MenuCategory.items)
            .selectinload(MenuItem.modifier_groups)
            .selectinload(ModifierGroup.modifiers),
            selectinload(Menu.categories)
            .selectinload(MenuCategory.items)
            .selectinload(MenuItem.tax_profile)
            .selectinload(TaxProfile.versions),
        )
    )
    return result.scalar_one_or_none()


async def _load_category(
    db: AsyncSession, category_id: UUID, business_id: UUID
) -> MenuCategory | None:
    result = await db.execute(
        select(MenuCategory)
        .where(
            MenuCategory.id == category_id,
            MenuCategory.business_id == business_id,
        )
        .options(
            selectinload(MenuCategory.items)
            .selectinload(MenuItem.modifier_groups)
            .selectinload(ModifierGroup.modifiers),
            selectinload(MenuCategory.items)
            .selectinload(MenuItem.tax_profile)
            .selectinload(TaxProfile.versions),
        )
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def _load_item(
    db: AsyncSession, item_id: UUID, business_id: UUID
) -> MenuItem | None:
    result = await db.execute(
        select(MenuItem)
        .where(MenuItem.id == item_id, MenuItem.business_id == business_id)
        .options(
            selectinload(MenuItem.modifier_groups).selectinload(ModifierGroup.modifiers),
            selectinload(MenuItem.tax_profile).selectinload(TaxProfile.versions),
        )
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


# ─── Menus ────────────────────────────────────────────────────────────────────

async def create_menu(db: AsyncSession, business_id: UUID, data: MenuCreate) -> Menu:
    menu = Menu(
        business_id=business_id,
        location_id=data.location_id,
        name=data.name,
        description=data.description,
    )
    db.add(menu)
    await db.flush()

    for cat_data in data.categories:
        await _create_category_for_menu(db, menu.id, business_id, cat_data)

    return await _load_menu(db, menu.id, business_id)


async def list_menus(db: AsyncSession, business_id: UUID) -> list[Menu]:
    result = await db.execute(
        select(Menu)
        .where(Menu.business_id == business_id)
        .options(
            selectinload(Menu.categories)
            .selectinload(MenuCategory.items)
            .selectinload(MenuItem.modifier_groups)
            .selectinload(ModifierGroup.modifiers),
            selectinload(Menu.categories)
            .selectinload(MenuCategory.items)
            .selectinload(MenuItem.tax_profile)
            .selectinload(TaxProfile.versions),
        )
        .order_by(Menu.created_at)
    )
    return list(result.scalars().unique().all())


async def get_active_menu(db: AsyncSession, business_id: UUID) -> Menu | None:
    """Return the first active menu with full nested data (public endpoint)."""
    result = await db.execute(
        select(Menu)
        .where(Menu.business_id == business_id, Menu.is_active == True)  # noqa: E712
        .options(
            selectinload(Menu.categories)
            .selectinload(MenuCategory.items)
            .selectinload(MenuItem.modifier_groups)
            .selectinload(ModifierGroup.modifiers),
            selectinload(Menu.categories)
            .selectinload(MenuCategory.items)
            .selectinload(MenuItem.tax_profile)
            .selectinload(TaxProfile.versions),
        )
        .order_by(Menu.created_at)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_menu(db: AsyncSession, menu_id: UUID, business_id: UUID) -> Menu | None:
    return await _load_menu(db, menu_id, business_id)


async def update_menu(
    db: AsyncSession, menu_id: UUID, business_id: UUID, data: MenuUpdate
) -> Menu | None:
    menu = await _load_menu(db, menu_id, business_id)
    if menu is None:
        return None
    if data.name is not None:
        menu.name = data.name
    if data.description is not None:
        menu.description = data.description
    if data.is_active is not None:
        menu.is_active = data.is_active
    await db.flush()
    return await _load_menu(db, menu.id, business_id)


async def delete_menu(db: AsyncSession, menu_id: UUID, business_id: UUID) -> bool:
    result = await db.execute(
        select(Menu).where(Menu.id == menu_id, Menu.business_id == business_id)
    )
    menu = result.scalar_one_or_none()
    if menu is None:
        return False
    await db.delete(menu)
    await db.flush()
    return True


# ─── Categories ───────────────────────────────────────────────────────────────

async def _create_category_for_menu(
    db: AsyncSession, menu_id: UUID, business_id: UUID, data: MenuCategoryCreate
) -> MenuCategory:
    cat = MenuCategory(
        menu_id=menu_id,
        business_id=business_id,
        name=data.name,
        display_order=data.display_order,
    )
    db.add(cat)
    await db.flush()

    for item_data in data.items:
        await _create_item_for_category(db, cat.id, business_id, item_data)

    return cat


async def create_category(
    db: AsyncSession, menu_id: UUID, business_id: UUID, data: MenuCategoryCreate
) -> MenuCategory | None:
    # Verify menu belongs to business
    result = await db.execute(
        select(Menu).where(Menu.id == menu_id, Menu.business_id == business_id)
    )
    if result.scalar_one_or_none() is None:
        return None
    cat = await _create_category_for_menu(db, menu_id, business_id, data)
    return await _load_category(db, cat.id, business_id)


async def update_category(
    db: AsyncSession, category_id: UUID, business_id: UUID, data: MenuCategoryUpdate
) -> MenuCategory | None:
    cat = await _load_category(db, category_id, business_id)
    if cat is None:
        return None
    if data.name is not None:
        cat.name = data.name
    if data.display_order is not None:
        cat.display_order = data.display_order
    if data.is_active is not None:
        cat.is_active = data.is_active
    await db.flush()
    return await _load_category(db, cat.id, business_id)


async def delete_category(db: AsyncSession, category_id: UUID, business_id: UUID) -> bool:
    result = await db.execute(
        select(MenuCategory).where(
            MenuCategory.id == category_id, MenuCategory.business_id == business_id
        )
    )
    cat = result.scalar_one_or_none()
    if cat is None:
        return False
    await db.delete(cat)
    await db.flush()
    return True


# ─── Items ────────────────────────────────────────────────────────────────────

async def _create_item_for_category(
    db: AsyncSession, category_id: UUID, business_id: UUID, data: MenuItemCreate
) -> MenuItem:
    tax_profile_id = await _resolve_tax_profile_id(db, business_id, data.tax_profile_id)
    station = None
    if not data.routes_to_all_stations:
        if data.preparation_station_id is None:
            raise ValueError("Choose one preparation station or route to all stations")
        station = await preparation_station_service.get_active_station(
            db, business_id, data.preparation_station_id
        )
    item = MenuItem(
        category_id=category_id,
        business_id=business_id,
        tax_profile_id=tax_profile_id,
        name=data.name,
        description=data.description,
        price=data.price,
        happy_hour_price=data.happy_hour_price,
        is_alcoholic=data.is_alcoholic,
        is_available=data.is_available,
        routing_tag=("any" if data.routes_to_all_stations else (
            station.name.lower() if station and station.name.lower() in {"kitchen", "bar"} else "any"
        )),
        preparation_station_id=station.id if station else None,
        routes_to_all_stations=data.routes_to_all_stations,
        prep_time_minutes=data.prep_time_minutes,
        display_order=data.display_order,
        image=data.image,
    )
    db.add(item)
    await db.flush()

    for group_data in data.modifier_groups:
        await _create_modifier_group_for_item(db, item.id, business_id, group_data)

    return item


async def create_item(
    db: AsyncSession, category_id: UUID, business_id: UUID, data: MenuItemCreate
) -> MenuItem | None:
    result = await db.execute(
        select(MenuCategory).where(
            MenuCategory.id == category_id, MenuCategory.business_id == business_id
        )
    )
    if result.scalar_one_or_none() is None:
        return None
    item = await _create_item_for_category(db, category_id, business_id, data)
    return await _load_item(db, item.id, business_id)


async def update_item(
    db: AsyncSession, item_id: UUID, business_id: UUID, data: MenuItemUpdate
) -> MenuItem | None:
    item = await _load_item(db, item_id, business_id)
    if item is None:
        return None
    if data.name is not None:
        item.name = data.name
    if data.description is not None:
        item.description = data.description
    if data.price is not None:
        item.price = data.price
    # happy_hour_price: present (even as null) = set/clear; absent = unchanged.
    if "happy_hour_price" in data.model_fields_set:
        item.happy_hour_price = data.happy_hour_price
    if data.is_alcoholic is not None:
        item.is_alcoholic = data.is_alcoholic
    if data.is_available is not None:
        item.is_available = data.is_available
    if "routes_to_all_stations" in data.model_fields_set or "preparation_station_id" in data.model_fields_set:
        routes_to_all = (
            data.routes_to_all_stations
            if data.routes_to_all_stations is not None
            else item.routes_to_all_stations
        )
        if routes_to_all:
            item.routes_to_all_stations = True
            item.preparation_station_id = None
            item.routing_tag = "any"
        else:
            station_id = data.preparation_station_id or item.preparation_station_id
            if station_id is None:
                raise ValueError("Choose one preparation station or route to all stations")
            station = await preparation_station_service.get_active_station(
                db, business_id, station_id
            )
            item.routes_to_all_stations = False
            item.preparation_station_id = station.id
            item.routing_tag = (
                station.name.lower() if station.name.lower() in {"kitchen", "bar"} else "any"
            )
    if data.prep_time_minutes is not None:
        item.prep_time_minutes = data.prep_time_minutes
    if data.display_order is not None:
        item.display_order = data.display_order
    if data.image is not None:
        item.image = data.image
    if data.tax_profile_id is not None:
        item.tax_profile_id = await _resolve_tax_profile_id(
            db, business_id, data.tax_profile_id
        )
    await db.flush()
    return await _load_item(db, item.id, business_id)


async def set_item_availability(
    db: AsyncSession,
    item_id: UUID,
    business_id: UUID,
    *,
    is_available: bool,
    source: str,
    actor_id: UUID | None,
    reason: str | None,
) -> MenuItem | None:
    item = await db.scalar(
        select(MenuItem).where(
            MenuItem.id == item_id, MenuItem.business_id == business_id
        ).with_for_update()
    )
    if item is None:
        return None
    if item.is_available == is_available:
        return await _load_item(db, item.id, business_id)
    item.is_available = is_available
    db.add(MenuItemAvailabilityEvent(
        business_id=business_id,
        menu_item_id=item.id,
        source=source,
        is_available=is_available,
        actor_id=actor_id,
        reason=reason,
    ))
    await db.flush()
    return await _load_item(db, item.id, business_id)


async def delete_item(db: AsyncSession, item_id: UUID, business_id: UUID) -> bool:
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_id, MenuItem.business_id == business_id
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        return False
    await db.delete(item)
    await db.flush()
    return True


# ─── Modifier Groups ──────────────────────────────────────────────────────────

async def _create_modifier_group_for_item(
    db: AsyncSession, item_id: UUID, business_id: UUID, data: ModifierGroupCreate
) -> ModifierGroup:
    group = ModifierGroup(
        item_id=item_id,
        business_id=business_id,
        name=data.name,
        required=data.required,
        min_select=data.min_select,
        max_select=data.max_select,
    )
    db.add(group)
    await db.flush()

    for mod_data in data.modifiers:
        mod = Modifier(
            group_id=group.id,
            business_id=business_id,
            name=mod_data.name,
            price_delta=mod_data.price_delta,
            is_available=mod_data.is_available,
        )
        db.add(mod)

    await db.flush()
    return group


async def create_modifier_group(
    db: AsyncSession, item_id: UUID, business_id: UUID, data: ModifierGroupCreate
) -> ModifierGroup | None:
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_id, MenuItem.business_id == business_id
        )
    )
    if result.scalar_one_or_none() is None:
        return None
    group = await _create_modifier_group_for_item(db, item_id, business_id, data)
    await db.refresh(group, ["modifiers"])
    return group


async def create_modifier(
    db: AsyncSession, group_id: UUID, business_id: UUID, data: ModifierCreate
) -> Modifier | None:
    result = await db.execute(
        select(ModifierGroup).where(
            ModifierGroup.id == group_id, ModifierGroup.business_id == business_id
        )
    )
    if result.scalar_one_or_none() is None:
        return None
    mod = Modifier(
        group_id=group_id,
        business_id=business_id,
        name=data.name,
        price_delta=data.price_delta,
        is_available=data.is_available,
    )
    db.add(mod)
    await db.flush()
    await db.refresh(mod)
    return mod


async def delete_modifier_group(
    db: AsyncSession, group_id: UUID, business_id: UUID
) -> bool:
    result = await db.execute(
        select(ModifierGroup).where(
            ModifierGroup.id == group_id, ModifierGroup.business_id == business_id
        )
    )
    group = result.scalar_one_or_none()
    if group is None:
        return False
    await db.delete(group)
    await db.flush()
    return True


# ─── Item Library ─────────────────────────────────────────────────────────────

async def list_library_items(db: AsyncSession, business_id: UUID) -> list[ItemLibrary]:
    result = await db.execute(
        select(ItemLibrary)
        .where(ItemLibrary.business_id == business_id)
        .order_by(ItemLibrary.name)
    )
    return list(result.scalars().all())


async def create_library_item(
    db: AsyncSession, business_id: UUID, data: LibraryItemCreate
) -> ItemLibrary:
    tax_profile_id = await _resolve_tax_profile_id(db, business_id, data.tax_profile_id)
    station = None
    if not data.routes_to_all_stations:
        if data.preparation_station_id is None:
            raise ValueError("Choose one preparation station or route to all stations")
        station = await preparation_station_service.get_active_station(
            db, business_id, data.preparation_station_id
        )
    item = ItemLibrary(
        business_id=business_id,
        tax_profile_id=tax_profile_id,
        name=data.name,
        description=data.description,
        price=data.price,
        routing_tag=("any" if data.routes_to_all_stations else (
            station.name.lower() if station and station.name.lower() in {"kitchen", "bar"} else "any"
        )),
        preparation_station_id=station.id if station else None,
        routes_to_all_stations=data.routes_to_all_stations,
        prep_time_minutes=data.prep_time_minutes,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def update_library_item(
    db: AsyncSession, item_id: UUID, business_id: UUID, data: LibraryItemUpdate
) -> ItemLibrary | None:
    result = await db.execute(
        select(ItemLibrary).where(
            ItemLibrary.id == item_id, ItemLibrary.business_id == business_id
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        return None
    if data.name is not None:
        item.name = data.name
    if data.description is not None:
        item.description = data.description
    if data.price is not None:
        item.price = data.price
    if "routes_to_all_stations" in data.model_fields_set or "preparation_station_id" in data.model_fields_set:
        routes_to_all = (
            data.routes_to_all_stations
            if data.routes_to_all_stations is not None
            else item.routes_to_all_stations
        )
        if routes_to_all:
            item.routes_to_all_stations = True
            item.preparation_station_id = None
            item.routing_tag = "any"
        else:
            station_id = data.preparation_station_id or item.preparation_station_id
            if station_id is None:
                raise ValueError("Choose one preparation station or route to all stations")
            station = await preparation_station_service.get_active_station(
                db, business_id, station_id
            )
            item.routes_to_all_stations = False
            item.preparation_station_id = station.id
            item.routing_tag = (
                station.name.lower() if station.name.lower() in {"kitchen", "bar"} else "any"
            )
    if data.prep_time_minutes is not None:
        item.prep_time_minutes = data.prep_time_minutes
    if data.tax_profile_id is not None:
        item.tax_profile_id = await _resolve_tax_profile_id(
            db, business_id, data.tax_profile_id
        )
    await db.flush()
    await db.refresh(item)
    return item


async def delete_library_item(db: AsyncSession, item_id: UUID, business_id: UUID) -> bool:
    result = await db.execute(
        select(ItemLibrary).where(
            ItemLibrary.id == item_id, ItemLibrary.business_id == business_id
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        return False
    await db.delete(item)
    await db.flush()
    return True


async def save_item_to_library(
    db: AsyncSession, item_id: UUID, business_id: UUID
) -> ItemLibrary | None:
    """Copy an existing menu item into the item library."""
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_id, MenuItem.business_id == business_id
        )
    )
    source = result.scalar_one_or_none()
    if source is None:
        return None
    lib_item = ItemLibrary(
        business_id=business_id,
        tax_profile_id=source.tax_profile_id,
        name=source.name,
        description=source.description,
        price=source.price,
        routing_tag=source.routing_tag,
        preparation_station_id=source.preparation_station_id,
        routes_to_all_stations=source.routes_to_all_stations,
        prep_time_minutes=source.prep_time_minutes,
    )
    db.add(lib_item)
    await db.flush()
    await db.refresh(lib_item)
    return lib_item


async def add_library_item_to_category(
    db: AsyncSession, library_item_id: UUID, category_id: UUID, business_id: UUID
) -> MenuItem | None:
    """Copy a library item into a menu category as a new MenuItem."""
    lib_result = await db.execute(
        select(ItemLibrary).where(
            ItemLibrary.id == library_item_id, ItemLibrary.business_id == business_id
        )
    )
    lib_item = lib_result.scalar_one_or_none()
    if lib_item is None:
        return None

    cat_result = await db.execute(
        select(MenuCategory).where(
            MenuCategory.id == category_id, MenuCategory.business_id == business_id
        )
    )
    if cat_result.scalar_one_or_none() is None:
        return None

    new_item = MenuItem(
        category_id=category_id,
        business_id=business_id,
        tax_profile_id=lib_item.tax_profile_id,
        name=lib_item.name,
        description=lib_item.description,
        price=lib_item.price,
        routing_tag=lib_item.routing_tag,
        preparation_station_id=lib_item.preparation_station_id,
        routes_to_all_stations=lib_item.routes_to_all_stations,
        prep_time_minutes=lib_item.prep_time_minutes,
        is_available=True,
        display_order=0,
    )
    db.add(new_item)
    await db.flush()
    return await _load_item(db, new_item.id, business_id)
