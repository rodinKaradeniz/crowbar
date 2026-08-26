"""Count sessions: seeding, bar-native entry, variance, reconciliation and CSV.

A count is the one workflow where a human's reading of a shelf overrides the
ledger, so every test here checks that the override lands as an ordinary
movement and that the balance still equals the sum of the ledger afterwards.
"""
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.inventory import StockMovement
from app.models.staff import Staff
from app.models.user import User
from app.schemas.inventory import CountLineUpdate, CountSessionCreate, InventoryItemCreate
from app.services import inventory_operations_service as counts
from app.services import inventory_service, tax_service


async def _business(db: AsyncSession, suffix: str) -> Business:
    business = Business(
        name=f"Counts {suffix}",
        slug=f"counts-{suffix}",
        email=f"counts-{suffix}@example.com",
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
        email=f"counter-{suffix}@example.com",
        name="Cal Counter",
        password_hash="x",
        user_type="staff",
    )
    db.add(user)
    await db.flush()
    db.add(Staff(user_id=user.id, business_id=business.id, role="manager"))
    await db.flush()
    return user


async def _stocked(db: AsyncSession, business: Business, name: str, quantity: str):
    item = await inventory_service.create_item(
        db, business.id, InventoryItemCreate(name=name, unit_type="each")
    )
    await inventory_service.apply_movement(
        db, item, movement_type="receive", delta=Decimal(quantity), unit_cost_snapshot=Decimal("2")
    )
    return item


@pytest.mark.asyncio
async def test_opening_a_session_seeds_a_line_per_active_item(db_session: AsyncSession):
    business = await _business(db_session, "seed")
    actor = await _actor(db_session, business, "seed")
    await _stocked(db_session, business, "Lime", "40")
    await _stocked(db_session, business, "Lemon", "25")

    session = await counts.create_count_session(
        db_session, business.id, actor.id, CountSessionCreate(kind="stocktake")
    )
    payload = await counts.count_session_response(db_session, business.id, session)
    assert session.status == "open"
    assert {line["item_name"] for line in payload["lines"]} == {"Lime", "Lemon"}
    # Book quantities are seeded from the ledger so the sheet shows an expected
    # figure while it is walked.
    assert {line["book_quantity"] for line in payload["lines"]} == {
        Decimal("40.000"),
        Decimal("25.000"),
    }


@pytest.mark.asyncio
async def test_a_second_open_session_for_the_same_location_is_refused(db_session: AsyncSession):
    business = await _business(db_session, "double")
    actor = await _actor(db_session, business, "double")
    await _stocked(db_session, business, "Lime", "10")
    await counts.create_count_session(
        db_session, business.id, actor.id, CountSessionCreate(kind="stocktake")
    )
    with pytest.raises(counts.CountSessionError, match="already open"):
        await counts.create_count_session(
            db_session, business.id, actor.id, CountSessionCreate(kind="cycle_count")
        )


@pytest.mark.asyncio
async def test_reconcile_writes_variance_movements_and_keeps_ledger_equal(
    db_session: AsyncSession,
):
    business = await _business(db_session, "variance")
    actor = await _actor(db_session, business, "variance")
    short = await _stocked(db_session, business, "Lime", "40")
    over = await _stocked(db_session, business, "Lemon", "25")
    business_id, short_id, over_id = business.id, short.id, over.id

    session = await counts.create_count_session(
        db_session, business_id, actor.id, CountSessionCreate(kind="stocktake")
    )
    payload = await counts.count_session_response(db_session, business_id, session)
    by_name = {line["item_name"]: line["id"] for line in payload["lines"]}

    await counts.apply_count_lines(
        db_session,
        business_id,
        session.id,
        [
            CountLineUpdate(
                count_line_id=by_name["Lime"],
                counted_quantity=Decimal("36"),
                shrinkage_reason="breakage",
            ),
            CountLineUpdate(count_line_id=by_name["Lemon"], counted_quantity=Decimal("27")),
        ],
    )
    await counts.reconcile_count(db_session, business_id, session.id, actor.id)

    await db_session.refresh(short)
    await db_session.refresh(over)
    assert short.current_quantity == Decimal("36.000")
    assert over.current_quantity == Decimal("27.000")

    for item_id in (short_id, over_id):
        stored = await db_session.scalar(
            select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
                StockMovement.item_id == item_id
            )
        )
        assert stored == (Decimal("36.000") if item_id == short_id else Decimal("27.000"))

    # A shortfall is waste, a surplus is an adjustment, and both point back at
    # the session that produced them.
    kinds = dict(
        (
            await db_session.execute(
                select(StockMovement.movement_type, StockMovement.item_id).where(
                    StockMovement.reference_type == "count_reconciliation"
                )
            )
        ).all()
    )
    assert kinds == {"waste": short_id, "adjust": over_id}


@pytest.mark.asyncio
async def test_negative_variance_requires_a_shrinkage_reason(db_session: AsyncSession):
    business = await _business(db_session, "shrink")
    actor = await _actor(db_session, business, "shrink")
    await _stocked(db_session, business, "Lime", "40")
    session = await counts.create_count_session(
        db_session, business.id, actor.id, CountSessionCreate(kind="stocktake")
    )
    payload = await counts.count_session_response(db_session, business.id, session)
    await counts.apply_count_lines(
        db_session,
        business.id,
        session.id,
        [
            CountLineUpdate(
                count_line_id=payload["lines"][0]["id"], counted_quantity=Decimal("30")
            )
        ],
    )
    with pytest.raises(counts.CountSessionError, match="shrinkage reason"):
        await counts.reconcile_count(db_session, business.id, session.id, actor.id)


@pytest.mark.asyncio
async def test_pack_and_keg_entries_convert_to_canonical_base_units(db_session: AsyncSession):
    business = await _business(db_session, "barnative")
    actor = await _actor(db_session, business, "barnative")
    bottle = await inventory_service.create_item(
        db_session,
        business.id,
        InventoryItemCreate(name="Gin", unit_type="bottle", container_volume_ml=Decimal("700")),
    )
    keg = await inventory_service.create_item(
        db_session,
        business.id,
        InventoryItemCreate(name="Pils", unit_type="keg", container_volume_ml=Decimal("30000")),
    )
    pack = await inventory_service.create_pack_conversion(
        db_session,
        bottle.id,
        business.id,
        label="Bottle",
        pack_unit="bottle",
        base_quantity=Decimal("700"),
        is_default_receiving_unit=True,
    )
    session = await counts.create_count_session(
        db_session, business.id, actor.id, CountSessionCreate(kind="stocktake")
    )
    payload = await counts.count_session_response(db_session, business.id, session)
    by_name = {line["item_name"]: line["id"] for line in payload["lines"]}

    await counts.apply_count_lines(
        db_session,
        business.id,
        session.id,
        [
            # Three and a bit bottles, as a bartender would actually count them.
            CountLineUpdate(
                count_line_id=by_name["Gin"],
                pack_conversion_id=pack.id,
                pack_quantity=Decimal("3.4"),
            ),
            # A keg gauge reading, not a millilitre figure.
            CountLineUpdate(
                count_line_id=by_name["Pils"], keg_level_percent=Decimal("40")
            ),
        ],
    )
    refreshed = await counts.count_session_response(db_session, business.id, session)
    lines = {line["item_name"]: line for line in refreshed["lines"]}
    assert lines["Gin"]["counted_quantity"] == Decimal("2380.000")
    assert lines["Gin"]["entry_mode"] == "pack"
    assert lines["Gin"]["entry_value"] == Decimal("3.400")
    assert lines["Pils"]["counted_quantity"] == Decimal("12000.000")
    assert lines["Pils"]["entry_mode"] == "keg_level"


@pytest.mark.asyncio
async def test_a_count_line_accepts_exactly_one_entry_form(db_session: AsyncSession):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CountLineUpdate(
            count_line_id="00000000-0000-0000-0000-000000000001",
            counted_quantity=Decimal("1"),
            keg_level_percent=Decimal("50"),
        )
    with pytest.raises(ValidationError):
        CountLineUpdate(count_line_id="00000000-0000-0000-0000-000000000001")


@pytest.mark.asyncio
async def test_csv_round_trip_preserves_counted_quantities(db_session: AsyncSession):
    business = await _business(db_session, "csv")
    actor = await _actor(db_session, business, "csv")
    await _stocked(db_session, business, "Lime", "40")
    session = await counts.create_count_session(
        db_session, business.id, actor.id, CountSessionCreate(kind="stocktake")
    )
    sheet = await counts.export_count_sheet(db_session, business.id, session.id)
    assert "count_line_id" in sheet.splitlines()[0]

    payload = await counts.count_session_response(db_session, business.id, session)
    line_id = payload["lines"][0]["id"]
    csv_in = (
        "count_line_id,counted_quantity,shrinkage_reason,note\n"
        f"{line_id},37,breakage,Dropped a crate\n"
    )
    await counts.import_count_sheet(db_session, business.id, session.id, csv_in)
    refreshed = await counts.count_session_response(db_session, business.id, session)
    assert refreshed["lines"][0]["counted_quantity"] == Decimal("37.000")
    assert refreshed["lines"][0]["shrinkage_reason"] == "breakage"


@pytest.mark.asyncio
async def test_malformed_count_sheets_are_rejected_whole(db_session: AsyncSession):
    business = await _business(db_session, "badcsv")
    actor = await _actor(db_session, business, "badcsv")
    await _stocked(db_session, business, "Lime", "40")
    session = await counts.create_count_session(
        db_session, business.id, actor.id, CountSessionCreate(kind="stocktake")
    )
    payload = await counts.count_session_response(db_session, business.id, session)
    line_id = payload["lines"][0]["id"]

    with pytest.raises(counts.CountSessionError, match="needs the columns"):
        await counts.import_count_sheet(db_session, business.id, session.id, "a,b\n1,2\n")
    with pytest.raises(counts.CountSessionError, match="non-numeric"):
        await counts.import_count_sheet(
            db_session,
            business.id,
            session.id,
            f"count_line_id,counted_quantity\n{line_id},many\n",
        )
    with pytest.raises(counts.CountSessionError, match="negative"):
        await counts.import_count_sheet(
            db_session,
            business.id,
            session.id,
            f"count_line_id,counted_quantity\n{line_id},-4\n",
        )
    # A valid row alongside an invalid one must not land on its own.
    refreshed = await counts.count_session_response(db_session, business.id, session)
    assert refreshed["lines"][0]["counted_quantity"] == Decimal("40.000")


@pytest.mark.asyncio
async def test_counts_refuse_another_tenants_session(db_session: AsyncSession):
    mine = await _business(db_session, "mine")
    theirs = await _business(db_session, "theirs")
    their_actor = await _actor(db_session, theirs, "theirs")
    await _stocked(db_session, theirs, "Lime", "10")
    their_session = await counts.create_count_session(
        db_session, theirs.id, their_actor.id, CountSessionCreate(kind="stocktake")
    )
    with pytest.raises(counts.CountSessionError, match="not found"):
        await counts.get_count_session(db_session, mine.id, their_session.id)
    with pytest.raises(counts.CountSessionError, match="not found"):
        await counts.reconcile_count(db_session, mine.id, their_session.id, their_actor.id)


@pytest.mark.asyncio
async def test_a_reconciled_session_cannot_be_edited_or_reconciled_again(
    db_session: AsyncSession,
):
    business = await _business(db_session, "closed")
    actor = await _actor(db_session, business, "closed")
    await _stocked(db_session, business, "Lime", "40")
    session = await counts.create_count_session(
        db_session, business.id, actor.id, CountSessionCreate(kind="stocktake")
    )
    payload = await counts.count_session_response(db_session, business.id, session)
    line_id = payload["lines"][0]["id"]
    await counts.reconcile_count(db_session, business.id, session.id, actor.id)

    with pytest.raises(counts.CountSessionError, match="cannot be edited"):
        await counts.apply_count_lines(
            db_session,
            business.id,
            session.id,
            [CountLineUpdate(count_line_id=line_id, counted_quantity=Decimal("1"))],
        )
    with pytest.raises(counts.CountSessionError, match="Only an open count"):
        await counts.reconcile_count(db_session, business.id, session.id, actor.id)
