"""Cost control figures and the honesty of their explanations.

MVP_ACCEPTANCE requires that a missing cost, forecast or lead time produces an
explicit incomplete estimate and never invented precision, so these tests assert
the incompleteness markers as hard as they assert the arithmetic.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.menu import Menu, MenuCategory, MenuItem
from app.models.staff import Staff
from app.models.user import User
from app.schemas.inventory import InventoryItemCreate
from app.schemas.purchasing import (
    PurchaseOrderCreate,
    PurchaseOrderLineCreate,
    SupplierCreate,
    SupplierProductCreate,
)
from app.schemas.recipe import RecipeIngredientInput
from app.services import (
    cost_control_service,
    inventory_service,
    purchasing_service,
    recipe_service,
    tax_service,
)


async def _business(db: AsyncSession, suffix: str) -> Business:
    business = Business(
        name=f"Cost {suffix}",
        slug=f"cost-{suffix}",
        email=f"cost-{suffix}@example.com",
        phone="+4915112345678",
        enabled_modules=["inventory", "ordering"],
        currency_code="EUR",
    )
    db.add(business)
    await db.flush()
    await tax_service.create_default_profiles(db, business)
    return business


async def _actor(db: AsyncSession, business: Business, suffix: str) -> User:
    user = User(
        email=f"cost-{suffix}@example.com",
        name="Mo Manager",
        password_hash="x",
        user_type="staff",
    )
    db.add(user)
    await db.flush()
    db.add(Staff(user_id=user.id, business_id=business.id, role="manager"))
    await db.flush()
    return user


async def _menu_item(db: AsyncSession, business: Business, name: str, price: str) -> MenuItem:
    menu = Menu(business_id=business.id, name="Main")
    db.add(menu)
    await db.flush()
    category = MenuCategory(business_id=business.id, menu_id=menu.id, name="Drinks")
    db.add(category)
    await db.flush()
    tax_profiles = await tax_service.list_profiles(db, business.id)
    item = MenuItem(
        business_id=business.id,
        category_id=category.id,
        name=name,
        price=Decimal(price),
        tax_profile_id=tax_profiles[0].id,
    )
    db.add(item)
    await db.flush()
    return item


@pytest.mark.asyncio
async def test_valuation_names_items_it_could_not_cost(db_session: AsyncSession):
    business = await _business(db_session, "valuation")
    costed = await inventory_service.create_item(
        db_session, business.id, InventoryItemCreate(name="Lime", unit_type="each")
    )
    await inventory_service.apply_movement(
        db_session,
        costed,
        movement_type="receive",
        delta=Decimal("10"),
        unit_cost_snapshot=Decimal("0.50"),
    )
    await inventory_service.create_item(
        db_session, business.id, InventoryItemCreate(name="Mystery", unit_type="each")
    )

    valuation = await cost_control_service.inventory_valuation(db_session, business.id, "EUR")
    assert valuation["total_value"] == Decimal("5.00")
    assert valuation["currency_code"] == "EUR"
    # The uncosted item is named rather than silently valued at zero.
    assert valuation["items_without_cost"] == ["Mystery"]
    assert valuation["complete"] is False


@pytest.mark.asyncio
async def test_recipe_cost_margin_and_pour_cost(db_session: AsyncSession):
    business = await _business(db_session, "margin")
    gin = await inventory_service.create_item(
        db_session,
        business.id,
        InventoryItemCreate(name="Gin", unit_type="bottle", container_volume_ml=Decimal("700")),
    )
    await inventory_service.apply_movement(
        db_session,
        gin,
        movement_type="receive",
        delta=Decimal("7000"),
        unit_cost_snapshot=Decimal("0.05"),
    )
    drink = await _menu_item(db_session, business, "Gin & Tonic", "10.00")
    await recipe_service.set_recipe(
        db_session,
        drink.id,
        business.id,
        [RecipeIngredientInput(inventory_item_id=gin.id, quantity=Decimal("50"))],
    )

    detail = await cost_control_service.recipe_cost(db_session, business.id, drink.id)
    # 50 ml at 0.05 EUR/ml.
    assert detail["cost"] == Decimal("2.50")
    assert detail["complete"] is True

    margins = await cost_control_service.menu_margins(db_session, business.id, "EUR")
    row = next(r for r in margins["items"] if r["menu_item_id"] == drink.id)
    assert row["gross_margin"] == Decimal("7.50")
    assert row["gross_margin_percent"] == Decimal("75.00")
    assert row["pour_cost_percent"] == Decimal("25.00")


@pytest.mark.asyncio
async def test_a_menu_item_without_a_recipe_reports_incomplete_not_full_margin(
    db_session: AsyncSession,
):
    business = await _business(db_session, "norecipe")
    drink = await _menu_item(db_session, business, "House Pour", "8.00")
    margins = await cost_control_service.menu_margins(db_session, business.id, "EUR")
    row = next(r for r in margins["items"] if r["menu_item_id"] == drink.id)
    # Without a recipe the margin is unknown, not 100 percent.
    assert row["gross_margin"] is None
    assert row["pour_cost_percent"] is None
    assert row["complete"] is False
    assert row["incomplete_reason"] == "No recipe"


@pytest.mark.asyncio
async def test_recipe_cost_refuses_another_tenants_menu_item(db_session: AsyncSession):
    mine = await _business(db_session, "mine")
    theirs = await _business(db_session, "theirs")
    their_item = await _menu_item(db_session, theirs, "Their Drink", "9.00")
    # Returning zero for a foreign id would be both a wrong answer and an
    # existence oracle.
    with pytest.raises(cost_control_service.CostControlError, match="not found"):
        await cost_control_service.recipe_cost(db_session, mine.id, their_item.id)


@pytest.mark.asyncio
async def test_reorder_does_not_double_count_stock_already_received(db_session: AsyncSession):
    business = await _business(db_session, "reorder")
    item = await inventory_service.create_item(
        db_session,
        business.id,
        InventoryItemCreate(name="Tonic", unit_type="each", par_quantity=Decimal("100")),
    )
    # 60 units arrived today. They are on the shelf, so the shortfall is 40 --
    # not zero, which is what subtracting the receipt a second time produced.
    await inventory_service.apply_movement(
        db_session,
        item,
        movement_type="receive",
        delta=Decimal("60"),
        unit_cost_snapshot=Decimal("1"),
    )

    suggestions = await cost_control_service.reorder_suggestions(db_session, business.id)
    assert len(suggestions) == 1
    assert suggestions[0]["suggested_quantity"] == Decimal("40.000")
    assert suggestions[0]["explanation"]["on_hand"] == Decimal("60.000")
    assert suggestions[0]["explanation"]["outstanding_on_order"] == Decimal(0)


@pytest.mark.asyncio
async def test_reorder_subtracts_only_undelivered_purchase_order_quantity(
    db_session: AsyncSession,
):
    business = await _business(db_session, "onorder")
    actor = await _actor(db_session, business, "onorder")
    item = await inventory_service.create_item(
        db_session,
        business.id,
        InventoryItemCreate(name="Tonic", unit_type="each", par_quantity=Decimal("100")),
    )
    pack = await inventory_service.create_pack_conversion(
        db_session,
        item.id,
        business.id,
        label="Tray of 24",
        pack_unit="case",
        base_quantity=Decimal("24"),
        is_default_receiving_unit=True,
    )
    supplier = await purchasing_service.create_supplier(
        db_session, business.id, SupplierCreate(name="Drinks Co")
    )
    po = await purchasing_service.create_purchase_order(
        db_session,
        business,
        actor.id,
        PurchaseOrderCreate(
            supplier_id=supplier.id,
            lines=[
                PurchaseOrderLineCreate(
                    inventory_item_id=item.id,
                    pack_conversion_id=pack.id,
                    description="Tonic trays",
                    ordered_quantity=Decimal("2"),
                    unit_price=Decimal("20"),
                )
            ],
        ),
    )
    await purchasing_service.transition_purchase_order(
        db_session, business.id, po.id, actor.id, "approved"
    )
    await purchasing_service.transition_purchase_order(
        db_session, business.id, po.id, actor.id, "ordered"
    )

    suggestions = await cost_control_service.reorder_suggestions(db_session, business.id)
    # Par 100, nothing on hand, 48 owed on an open order.
    assert suggestions[0]["explanation"]["outstanding_on_order"] == Decimal("48.000")
    assert suggestions[0]["suggested_quantity"] == Decimal("52.000")


@pytest.mark.asyncio
async def test_reorder_explanation_states_whether_lead_time_is_known(db_session: AsyncSession):
    business = await _business(db_session, "leadtime")
    item = await inventory_service.create_item(
        db_session,
        business.id,
        InventoryItemCreate(name="Tonic", unit_type="each", par_quantity=Decimal("100")),
    )
    suggestions = await cost_control_service.reorder_suggestions(db_session, business.id)
    explanation = suggestions[0]["explanation"]
    # No supplier product, so no lead time -- and the response says so rather
    # than implying same-day delivery was forecast.
    assert explanation["lead_time_known"] is False
    assert explanation["lead_time_days"] is None
    assert explanation["lead_time_cover"] == Decimal(0)

    supplier = await purchasing_service.create_supplier(
        db_session, business.id, SupplierCreate(name="Drinks Co")
    )
    await purchasing_service.create_supplier_product(
        db_session,
        business,
        supplier.id,
        SupplierProductCreate(
            inventory_item_id=item.id, product_name="Tonic", lead_time_days=7
        ),
    )
    suggestions = await cost_control_service.reorder_suggestions(db_session, business.id)
    explanation = suggestions[0]["explanation"]
    assert explanation["lead_time_known"] is True
    assert explanation["lead_time_days"] == 7
    # Every term the formula names is present in the explanation.
    for key in (
        "par_quantity",
        "average_consumed_per_day",
        "lead_time_days",
        "lead_time_cover",
        "target_quantity",
        "on_hand",
        "outstanding_on_order",
    ):
        assert key in explanation


@pytest.mark.asyncio
async def test_cogs_values_consumption_at_the_cost_in_force_when_it_moved(
    db_session: AsyncSession,
):
    business = await _business(db_session, "cogs")
    item = await inventory_service.create_item(
        db_session, business.id, InventoryItemCreate(name="Lime", unit_type="each")
    )
    await inventory_service.apply_movement(
        db_session,
        item,
        movement_type="receive",
        delta=Decimal("100"),
        unit_cost_snapshot=Decimal("0.50"),
    )
    await inventory_service.apply_movement(
        db_session, item, movement_type="sale", delta=Decimal("-10")
    )
    # A later, dearer purchase must not revalue the sale that already happened.
    await inventory_service.apply_movement(
        db_session,
        item,
        movement_type="receive",
        delta=Decimal("100"),
        unit_cost_snapshot=Decimal("2.00"),
    )
    await inventory_service.apply_movement(
        db_session, item, movement_type="waste", delta=Decimal("-5"), reason="spillage"
    )

    start = datetime.now(timezone.utc) - timedelta(days=1)
    end = datetime.now(timezone.utc) + timedelta(days=1)
    cogs = await cost_control_service.controllable_cogs(
        db_session, business.id, "EUR", start=start, end=end
    )
    assert cogs["sold_cost"] == Decimal("5.00")
    assert cogs["waste_cost"] == Decimal("6.45")
    assert cogs["complete"] is True


@pytest.mark.asyncio
async def test_variance_groups_waste_by_reason(db_session: AsyncSession):
    business = await _business(db_session, "waste")
    item = await inventory_service.create_item(
        db_session, business.id, InventoryItemCreate(name="Lime", unit_type="each")
    )
    await inventory_service.apply_movement(
        db_session,
        item,
        movement_type="receive",
        delta=Decimal("100"),
        unit_cost_snapshot=Decimal("1"),
    )
    await inventory_service.apply_movement(
        db_session, item, movement_type="waste", delta=Decimal("-3"), reason="spillage"
    )
    await inventory_service.apply_movement(
        db_session, item, movement_type="waste", delta=Decimal("-2"), reason="expiry"
    )
    await inventory_service.apply_movement(
        db_session, item, movement_type="sale", delta=Decimal("-8")
    )

    start = datetime.now(timezone.utc) - timedelta(days=1)
    end = datetime.now(timezone.utc) + timedelta(days=1)
    variance = await cost_control_service.consumption_variance(
        db_session, business.id, "EUR", start=start, end=end
    )
    row = variance["items"][0]
    assert row["sold_quantity"] == Decimal("8.000")
    assert row["waste_quantity"] == Decimal("5.000")
    assert {line["reason"] for line in row["waste_by_reason"]} == {"spillage", "expiry"}
    assert variance["total_waste_value"] == Decimal("5.00")
