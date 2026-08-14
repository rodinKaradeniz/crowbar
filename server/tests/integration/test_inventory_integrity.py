import asyncio
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.inventory import InventoryItem, StockMovement
from app.models.location import Location
from app.models.menu import Menu, MenuCategory, MenuItem
from app.models.recipe import MenuItemIngredient
from app.schemas.inventory import InventoryItemCreate, InventoryItemUpdate, StockMovementCreate
from app.schemas.recipe import RecipeIngredientInput
from app.services import inventory_service, recipe_service
from tests.conftest import TestSessionLocal


async def _business(db: AsyncSession, suffix: str) -> Business:
    business = Business(
        name=f"Inventory {suffix}",
        slug=f"inventory-{suffix}",
        email=f"inventory-{suffix}@example.com",
        phone="+4915112345678",
        enabled_modules=["inventory", "ordering"],
    )
    db.add(business)
    await db.flush()
    return business


@pytest.mark.asyncio
async def test_concurrent_movements_keep_balance_equal_to_ledger(
    db_session: AsyncSession,
):
    business = await _business(db_session, "concurrent")
    item = await inventory_service.create_item(
        db_session,
        business.id,
        InventoryItemCreate(name="Lime", unit_type="each"),
    )
    item_id = item.id
    business_id = business.id
    await db_session.commit()

    async def receive_once():
        async with TestSessionLocal() as session:
            await inventory_service.record_movement(
                session,
                item_id,
                business_id,
                StockMovementCreate(movement_type="receive", quantity_delta=1),
            )
            await session.commit()

    await asyncio.gather(receive_once(), receive_once())
    db_session.expire_all()
    stored = await db_session.scalar(
        select(InventoryItem.current_quantity).where(InventoryItem.id == item_id)
    )
    ledger = await db_session.scalar(
        select(func.sum(StockMovement.quantity_delta)).where(
            StockMovement.item_id == item_id
        )
    )
    assert stored == Decimal("2.000")
    assert ledger == stored


@pytest.mark.asyncio
async def test_archiving_preserves_item_and_movement_history(
    db_session: AsyncSession,
):
    business = await _business(db_session, "archive")
    item = await inventory_service.create_item(
        db_session, business.id, InventoryItemCreate(name="Mint")
    )
    await inventory_service.record_movement(
        db_session,
        item.id,
        business.id,
        StockMovementCreate(movement_type="receive", quantity_delta=5),
    )
    assert await inventory_service.delete_item(db_session, item.id, business.id)
    await db_session.flush()

    archived = await inventory_service.get_item(
        db_session, item.id, business.id, include_archived=True
    )
    assert archived is not None
    assert archived.is_active is False
    assert archived.archived_at is not None
    movements = await inventory_service.list_movements(
        db_session, item.id, business.id
    )
    assert len(movements) == 1


@pytest.mark.asyncio
async def test_inventory_patch_clears_nullable_values_and_rejects_foreign_location(
    db_session: AsyncSession,
):
    business = await _business(db_session, "patch")
    foreign = await _business(db_session, "foreign-location")
    own_location = Location(business_id=business.id, name="Main", is_primary=True)
    foreign_location = Location(
        business_id=foreign.id, name="Foreign", is_primary=True
    )
    db_session.add_all([own_location, foreign_location])
    await db_session.flush()
    item = await inventory_service.create_item(
        db_session,
        business.id,
        InventoryItemCreate(
            name="Syrup",
            par_quantity=5,
            cost_per_unit=2,
            notes="clear me",
            location_id=own_location.id,
        ),
    )

    updated = await inventory_service.update_item(
        db_session,
        item.id,
        business.id,
        InventoryItemUpdate(
            par_quantity=None,
            cost_per_unit=None,
            notes=None,
            location_id=None,
        ),
    )
    assert updated is not None
    assert updated.par_quantity is None
    assert updated.cost_per_unit is None
    assert updated.notes is None
    assert updated.location_id is None

    with pytest.raises(ValueError, match="does not belong"):
        await inventory_service.update_item(
            db_session,
            item.id,
            business.id,
            InventoryItemUpdate(location_id=foreign_location.id),
        )
    with pytest.raises(ValidationError):
        InventoryItemUpdate(par_quantity=-1)


@pytest.mark.asyncio
async def test_recipe_replacement_rejects_whole_invalid_payload(
    db_session: AsyncSession,
):
    business = await _business(db_session, "recipe")
    foreign = await _business(db_session, "recipe-foreign")
    valid_item = await inventory_service.create_item(
        db_session, business.id, InventoryItemCreate(name="Gin")
    )
    foreign_item = await inventory_service.create_item(
        db_session, foreign.id, InventoryItemCreate(name="Foreign Gin")
    )
    menu = Menu(business_id=business.id, name="Menu")
    db_session.add(menu)
    await db_session.flush()
    category = MenuCategory(
        menu_id=menu.id, business_id=business.id, name="Cocktails"
    )
    db_session.add(category)
    await db_session.flush()
    menu_item = MenuItem(
        category_id=category.id,
        business_id=business.id,
        name="Martini",
        price=10,
    )
    db_session.add(menu_item)
    await db_session.flush()
    await recipe_service.set_recipe(
        db_session,
        menu_item.id,
        business.id,
        [RecipeIngredientInput(inventory_item_id=valid_item.id, quantity=1)],
    )

    with pytest.raises(ValueError, match="active inventory item"):
        await recipe_service.set_recipe(
            db_session,
            menu_item.id,
            business.id,
            [
                RecipeIngredientInput(
                    inventory_item_id=foreign_item.id, quantity=1
                )
            ],
        )
    remaining = list(
        (
            await db_session.scalars(
                select(MenuItemIngredient).where(
                    MenuItemIngredient.menu_item_id == menu_item.id
                )
            )
        ).all()
    )
    assert [line.inventory_item_id for line in remaining] == [valid_item.id]

    duplicate = RecipeIngredientInput(
        inventory_item_id=valid_item.id, quantity=1
    )
    with pytest.raises(ValueError, match="same inventory item twice"):
        await recipe_service.set_recipe(
            db_session,
            menu_item.id,
            business.id,
            [duplicate, duplicate],
        )
