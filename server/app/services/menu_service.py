from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.menu import ItemLibrary, Menu, MenuCategory, MenuItem, Modifier, ModifierGroup
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


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _load_menu(db: AsyncSession, menu_id: UUID, business_id: UUID) -> Menu | None:
    result = await db.execute(
        select(Menu)
        .where(Menu.id == menu_id, Menu.business_id == business_id)
        .options(
            selectinload(Menu.categories).selectinload(MenuCategory.items).selectinload(MenuItem.modifier_groups).selectinload(ModifierGroup.modifiers)
        )
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

    await db.refresh(menu, ["categories"])
    return menu


async def list_menus(db: AsyncSession, business_id: UUID) -> list[Menu]:
    result = await db.execute(
        select(Menu)
        .where(Menu.business_id == business_id)
        .options(
            selectinload(Menu.categories).selectinload(MenuCategory.items).selectinload(MenuItem.modifier_groups).selectinload(ModifierGroup.modifiers)
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
            selectinload(Menu.categories).selectinload(MenuCategory.items).selectinload(MenuItem.modifier_groups).selectinload(ModifierGroup.modifiers)
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
    await db.refresh(menu)
    return menu


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
    await db.refresh(cat, ["items"])
    return cat


async def update_category(
    db: AsyncSession, category_id: UUID, business_id: UUID, data: MenuCategoryUpdate
) -> MenuCategory | None:
    result = await db.execute(
        select(MenuCategory).where(
            MenuCategory.id == category_id, MenuCategory.business_id == business_id
        )
    )
    cat = result.scalar_one_or_none()
    if cat is None:
        return None
    if data.name is not None:
        cat.name = data.name
    if data.display_order is not None:
        cat.display_order = data.display_order
    if data.is_active is not None:
        cat.is_active = data.is_active
    await db.flush()
    await db.refresh(cat)
    return cat


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
    item = MenuItem(
        category_id=category_id,
        business_id=business_id,
        name=data.name,
        description=data.description,
        price=data.price,
        is_available=data.is_available,
        routing_tag=data.routing_tag,
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
    await db.refresh(item, ["modifier_groups"])
    return item


async def update_item(
    db: AsyncSession, item_id: UUID, business_id: UUID, data: MenuItemUpdate
) -> MenuItem | None:
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_id, MenuItem.business_id == business_id
        ).options(selectinload(MenuItem.modifier_groups).selectinload(ModifierGroup.modifiers))
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
    if data.is_available is not None:
        item.is_available = data.is_available
    if data.routing_tag is not None:
        item.routing_tag = data.routing_tag
    if data.prep_time_minutes is not None:
        item.prep_time_minutes = data.prep_time_minutes
    if data.display_order is not None:
        item.display_order = data.display_order
    if data.image is not None:
        item.image = data.image
    await db.flush()
    await db.refresh(item)
    return item


async def toggle_item_availability(
    db: AsyncSession, item_id: UUID, business_id: UUID
) -> MenuItem | None:
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_id, MenuItem.business_id == business_id
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        return None
    item.is_available = not item.is_available
    await db.flush()
    await db.refresh(item)
    return item


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
    item = ItemLibrary(
        business_id=business_id,
        name=data.name,
        description=data.description,
        price=data.price,
        routing_tag=data.routing_tag,
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
    if data.routing_tag is not None:
        item.routing_tag = data.routing_tag
    if data.prep_time_minutes is not None:
        item.prep_time_minutes = data.prep_time_minutes
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
        name=source.name,
        description=source.description,
        price=source.price,
        routing_tag=source.routing_tag,
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
        name=lib_item.name,
        description=lib_item.description,
        price=lib_item.price,
        routing_tag=lib_item.routing_tag,
        prep_time_minutes=lib_item.prep_time_minutes,
        is_available=True,
        display_order=0,
    )
    db.add(new_item)
    await db.flush()
    await db.refresh(new_item, ["modifier_groups"])
    return new_item
