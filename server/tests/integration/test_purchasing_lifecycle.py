"""Purchase order lifecycle, receiving, idempotency and cost basis.

Receiving is the only path that both moves stock and rewrites the running cost,
so these tests assert the ledger and the cost together rather than either alone.
"""
import asyncio
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.inventory import InventoryItem, StockMovement
from app.models.staff import Staff
from app.models.user import User
from app.models.purchasing import PurchaseOrder, PurchasePriceHistory, PurchaseReceipt
from app.schemas.inventory import InventoryItemCreate
from app.schemas.purchasing import (
    PurchaseOrderCreate,
    PurchaseOrderLineCreate,
    PurchaseReceiptCreate,
    PurchaseReceiptLineCreate,
    SupplierCreate,
    SupplierProductCreate,
)
from app.services import inventory_service, purchasing_service, tax_service
from tests.conftest import TestSessionLocal


async def _actor(db: AsyncSession, business: Business, suffix: str) -> User:
    """Movements record who made them, so tests need a real staff user."""
    user = await db.scalar(select(User).where(User.email == f"buyer-{suffix}@example.com"))
    if user is not None:
        return user
    user = User(
        email=f"buyer-{suffix}@example.com",
        name="Bea Buyer",
        password_hash="x",
        user_type="staff",
    )
    db.add(user)
    await db.flush()
    db.add(Staff(user_id=user.id, business_id=business.id, role="manager"))
    await db.flush()
    return user


async def _business(db: AsyncSession, suffix: str) -> Business:
    business = Business(
        name=f"Purchasing {suffix}",
        slug=f"purchasing-{suffix}",
        email=f"purchasing-{suffix}@example.com",
        phone="+4915112345678",
        enabled_modules=["inventory", "ordering"],
        currency_code="EUR",
    )
    db.add(business)
    await db.flush()
    await tax_service.create_default_profiles(db, business)
    return business


async def _bottled_item(db: AsyncSession, business: Business, name: str = "Gin"):
    """A 700 ml bottle tracked in ml, received by the 12-bottle case."""
    item = await inventory_service.create_item(
        db,
        business.id,
        InventoryItemCreate(name=name, unit_type="bottle", container_volume_ml=Decimal("700")),
    )
    pack = await inventory_service.create_pack_conversion(
        db,
        item.id,
        business.id,
        label="Case of 12",
        pack_unit="case",
        base_quantity=Decimal("8400"),
        is_default_receiving_unit=True,
    )
    return item, pack


async def _ordered_po(db: AsyncSession, business: Business, item, pack, *, quantity="2", price="240"):
    supplier = await purchasing_service.create_supplier(
        db, business.id, SupplierCreate(name="Fine Spirits")
    )
    actor = await _actor(db, business, business.slug)
    po = await purchasing_service.create_purchase_order(
        db,
        business,
        actor.id,
        PurchaseOrderCreate(
            supplier_id=supplier.id,
            lines=[
                PurchaseOrderLineCreate(
                    inventory_item_id=item.id,
                    pack_conversion_id=pack.id,
                    description="Gin, case of 12",
                    ordered_quantity=Decimal(quantity),
                    unit_price=Decimal(price),
                )
            ],
        ),
    )
    await purchasing_service.transition_purchase_order(
        db, business.id, po.id, actor.id, "approved"
    )
    await purchasing_service.transition_purchase_order(
        db, business.id, po.id, actor.id, "ordered"
    )
    return actor, po


@pytest.mark.asyncio
async def test_partial_then_full_receipt_moves_stock_cost_and_status(db_session: AsyncSession):
    business = await _business(db_session, "lifecycle")
    item, pack = await _bottled_item(db_session, business)
    actor, po = await _ordered_po(db_session, business, item, pack)
    lines = await purchasing_service._lines(db_session, business.id, po.id)
    # Held across the expire_all() calls below, which would otherwise force a
    # lazy reload of these identifiers outside the async context.
    business_id, item_id = business.id, item.id

    receipt, created = await purchasing_service.receive_purchase_order(
        db_session,
        business,
        po.id,
        actor.id,
        PurchaseReceiptCreate(
            idempotency_key="receipt-one-aaaa",
            delivery_reference="DN-1",
            lines=[
                PurchaseReceiptLineCreate(
                    purchase_order_line_id=lines[0].id,
                    received_quantity=Decimal("1"),
                    unit_price=Decimal("240"),
                )
            ],
        ),
    )
    assert created is True
    await db_session.refresh(po)
    assert po.status == "partially_received"

    await db_session.refresh(item)
    refreshed = await inventory_service.get_item(db_session, item_id, business_id)
    # One case of 12 x 700 ml.
    assert refreshed.current_quantity == Decimal("8400.000")
    # 240 EUR for 8400 ml is 0.028571 EUR/ml, per base unit and not per pack.
    assert refreshed.weighted_average_cost == Decimal("0.028571")

    history = await db_session.scalar(
        select(PurchasePriceHistory.unit_cost_per_base_unit).where(
            PurchasePriceHistory.business_id == business_id
        )
    )
    assert history == Decimal("0.028571")

    # Second case arrives dearer; the average moves between the two, never to
    # the newest price alone.
    await purchasing_service.receive_purchase_order(
        db_session,
        business,
        po.id,
        actor.id,
        PurchaseReceiptCreate(
            idempotency_key="receipt-two-bbbb",
            lines=[
                PurchaseReceiptLineCreate(
                    purchase_order_line_id=lines[0].id,
                    received_quantity=Decimal("1"),
                    unit_price=Decimal("300"),
                )
            ],
        ),
    )
    await db_session.refresh(po)
    assert po.status == "received"
    await db_session.refresh(item)
    refreshed = await inventory_service.get_item(db_session, item_id, business_id)
    assert refreshed.current_quantity == Decimal("16800.000")
    assert Decimal("0.028571") < refreshed.weighted_average_cost < Decimal("0.035715")

    ledger = await db_session.scalar(
        select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
            StockMovement.item_id == item_id
        )
    )
    assert ledger == refreshed.current_quantity


@pytest.mark.asyncio
async def test_same_idempotency_key_returns_one_receipt_and_applies_stock_once(
    db_session: AsyncSession,
):
    business = await _business(db_session, "idem")
    item, pack = await _bottled_item(db_session, business)
    actor, po = await _ordered_po(db_session, business, item, pack)
    lines = await purchasing_service._lines(db_session, business.id, po.id)
    business_id, item_id = business.id, item.id
    body = PurchaseReceiptCreate(
        idempotency_key="repeat-key-cccc",
        lines=[
            PurchaseReceiptLineCreate(
                purchase_order_line_id=lines[0].id,
                received_quantity=Decimal("1"),
                unit_price=Decimal("240"),
            )
        ],
    )

    first, created_first = await purchasing_service.receive_purchase_order(
        db_session, business, po.id, actor.id, body
    )
    second, created_second = await purchasing_service.receive_purchase_order(
        db_session, business, po.id, actor.id, body
    )
    assert created_first is True
    assert created_second is False
    assert first.id == second.id

    await db_session.refresh(item)
    refreshed = await inventory_service.get_item(db_session, item_id, business_id)
    assert refreshed.current_quantity == Decimal("8400.000")


@pytest.mark.asyncio
async def test_same_key_with_a_different_body_is_refused(db_session: AsyncSession):
    business = await _business(db_session, "fingerprint")
    item, pack = await _bottled_item(db_session, business)
    actor, po = await _ordered_po(db_session, business, item, pack)
    lines = await purchasing_service._lines(db_session, business.id, po.id)

    await purchasing_service.receive_purchase_order(
        db_session,
        business,
        po.id,
        actor.id,
        PurchaseReceiptCreate(
            idempotency_key="shared-key-dddd",
            lines=[
                PurchaseReceiptLineCreate(
                    purchase_order_line_id=lines[0].id,
                    received_quantity=Decimal("1"),
                    unit_price=Decimal("240"),
                )
            ],
        ),
    )
    with pytest.raises(purchasing_service.PurchasingError, match="different receipt"):
        await purchasing_service.receive_purchase_order(
            db_session,
            business,
            po.id,
            actor.id,
            PurchaseReceiptCreate(
                idempotency_key="shared-key-dddd",
                lines=[
                    PurchaseReceiptLineCreate(
                        purchase_order_line_id=lines[0].id,
                        received_quantity=Decimal("2"),
                        unit_price=Decimal("240"),
                    )
                ],
            ),
        )


@pytest.mark.asyncio
async def test_concurrent_identical_receipts_apply_stock_once(db_session: AsyncSession):
    business = await _business(db_session, "race")
    item, pack = await _bottled_item(db_session, business)
    actor, po = await _ordered_po(db_session, business, item, pack)
    lines = await purchasing_service._lines(db_session, business.id, po.id)
    business_id, po_id, line_id, item_id, actor_id = (
        business.id,
        po.id,
        lines[0].id,
        item.id,
        actor.id,
    )
    await db_session.commit()

    async def receive_once():
        async with TestSessionLocal() as session:
            loaded = await session.get(Business, business_id)
            try:
                await purchasing_service.receive_purchase_order(
                    session,
                    loaded,
                    po_id,
                    actor_id,
                    PurchaseReceiptCreate(
                        idempotency_key="race-key-eeee",
                        lines=[
                            PurchaseReceiptLineCreate(
                                purchase_order_line_id=line_id,
                                received_quantity=Decimal("1"),
                                unit_price=Decimal("240"),
                            )
                        ],
                    ),
                )
                await session.commit()
            except Exception:
                await session.rollback()

    await asyncio.gather(receive_once(), receive_once())
    db_session.expire_all()

    receipts = await db_session.scalar(
        select(func.count()).select_from(PurchaseReceipt).where(
            PurchaseReceipt.business_id == business_id
        )
    )
    assert receipts == 1
    stored = await db_session.scalar(
        select(InventoryItem.current_quantity).where(InventoryItem.id == item_id)
    )
    ledger = await db_session.scalar(
        select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
            StockMovement.item_id == item_id
        )
    )
    assert stored == Decimal("8400.000")
    assert ledger == stored


@pytest.mark.asyncio
async def test_over_receipt_without_a_discrepancy_reason_is_rejected(db_session: AsyncSession):
    business = await _business(db_session, "over")
    item, pack = await _bottled_item(db_session, business)
    actor, po = await _ordered_po(db_session, business, item, pack, quantity="1")
    lines = await purchasing_service._lines(db_session, business.id, po.id)

    with pytest.raises(purchasing_service.PurchasingError, match="discrepancy reason"):
        await purchasing_service.receive_purchase_order(
            db_session,
            business,
            po.id,
            actor.id,
            PurchaseReceiptCreate(
                idempotency_key="over-key-ffff",
                lines=[
                    PurchaseReceiptLineCreate(
                        purchase_order_line_id=lines[0].id,
                        received_quantity=Decimal("3"),
                        unit_price=Decimal("240"),
                    )
                ],
            ),
        )


@pytest.mark.asyncio
async def test_partially_received_order_can_be_closed_short(db_session: AsyncSession):
    business = await _business(db_session, "short")
    item, pack = await _bottled_item(db_session, business)
    actor, po = await _ordered_po(db_session, business, item, pack, quantity="5")
    lines = await purchasing_service._lines(db_session, business.id, po.id)
    await purchasing_service.receive_purchase_order(
        db_session,
        business,
        po.id,
        actor.id,
        PurchaseReceiptCreate(
            idempotency_key="short-key-gggg",
            lines=[
                PurchaseReceiptLineCreate(
                    purchase_order_line_id=lines[0].id,
                    received_quantity=Decimal("2"),
                    unit_price=Decimal("240"),
                )
            ],
        ),
    )
    await db_session.refresh(po)
    assert po.status == "partially_received"

    # Short closure needs a reason: an order that ends incomplete has to say why.
    with pytest.raises(purchasing_service.PurchasingError, match="requires a reason"):
        await purchasing_service.transition_purchase_order(
            db_session, business.id, po.id, actor.id, "closed_short"
        )
    closed = await purchasing_service.transition_purchase_order(
        db_session,
        business.id,
        po.id,
        actor.id,
        "closed_short",
        closure_reason="Supplier discontinued the line",
    )
    assert closed.status == "closed_short"
    assert closed.closure_reason == "Supplier discontinued the line"
    # Terminal really is terminal.
    with pytest.raises(purchasing_service.PurchasingError, match="Cannot change"):
        await purchasing_service.transition_purchase_order(
            db_session, business.id, po.id, actor.id, "cancelled"
        )


@pytest.mark.asyncio
async def test_ordered_purchase_order_can_still_be_cancelled(db_session: AsyncSession):
    business = await _business(db_session, "cancel")
    item, pack = await _bottled_item(db_session, business)
    actor, po = await _ordered_po(db_session, business, item, pack)
    cancelled = await purchasing_service.transition_purchase_order(
        db_session, business.id, po.id, actor.id, "cancelled"
    )
    assert cancelled.status == "cancelled"


@pytest.mark.asyncio
async def test_purchasing_refuses_another_tenants_rows(db_session: AsyncSession):
    mine = await _business(db_session, "mine")
    theirs = await _business(db_session, "theirs")
    my_item, my_pack = await _bottled_item(db_session, mine)
    their_item, their_pack = await _bottled_item(db_session, theirs, name="Vodka")
    their_supplier = await purchasing_service.create_supplier(
        db_session, theirs.id, SupplierCreate(name="Other Wholesaler")
    )
    actor = await _actor(db_session, mine, "isolation")

    # A supplier from another business is not a supplier.
    with pytest.raises(purchasing_service.PurchasingError, match="Supplier not found"):
        await purchasing_service.create_purchase_order(
            db_session,
            mine,
            actor.id,
            PurchaseOrderCreate(
                supplier_id=their_supplier.id,
                lines=[
                    PurchaseOrderLineCreate(
                        inventory_item_id=my_item.id,
                        pack_conversion_id=my_pack.id,
                        description="Gin",
                        ordered_quantity=Decimal("1"),
                        unit_price=Decimal("240"),
                    )
                ],
            ),
        )

    my_supplier = await purchasing_service.create_supplier(
        db_session, mine.id, SupplierCreate(name="My Wholesaler")
    )
    # Nor is another business's inventory item orderable.
    with pytest.raises(purchasing_service.PurchasingError):
        await purchasing_service.create_purchase_order(
            db_session,
            mine,
            actor.id,
            PurchaseOrderCreate(
                supplier_id=my_supplier.id,
                lines=[
                    PurchaseOrderLineCreate(
                        inventory_item_id=their_item.id,
                        pack_conversion_id=their_pack.id,
                        description="Vodka",
                        ordered_quantity=Decimal("1"),
                        unit_price=Decimal("240"),
                    )
                ],
            ),
        )


@pytest.mark.asyncio
async def test_pack_conversion_must_belong_to_the_ordered_item(db_session: AsyncSession):
    business = await _business(db_session, "packmix")
    gin, gin_pack = await _bottled_item(db_session, business, name="Gin")
    _, vodka_pack = await _bottled_item(db_session, business, name="Vodka")
    supplier = await purchasing_service.create_supplier(
        db_session, business.id, SupplierCreate(name="Wholesaler")
    )
    actor = await _actor(db_session, business, "packmix")
    with pytest.raises(purchasing_service.PurchasingError, match="does not belong"):
        await purchasing_service.create_purchase_order(
            db_session,
            business,
            actor.id,
            PurchaseOrderCreate(
                supplier_id=supplier.id,
                lines=[
                    PurchaseOrderLineCreate(
                        inventory_item_id=gin.id,
                        pack_conversion_id=vodka_pack.id,
                        description="Gin in the wrong pack",
                        ordered_quantity=Decimal("1"),
                        unit_price=Decimal("240"),
                    )
                ],
            ),
        )


@pytest.mark.asyncio
async def test_receipt_maintains_supplier_product_last_price(db_session: AsyncSession):
    business = await _business(db_session, "lastprice")
    item, pack = await _bottled_item(db_session, business)
    supplier = await purchasing_service.create_supplier(
        db_session, business.id, SupplierCreate(name="Fine Spirits")
    )
    product = await purchasing_service.create_supplier_product(
        db_session,
        business,
        supplier.id,
        SupplierProductCreate(
            inventory_item_id=item.id,
            product_name="Gin case",
            pack_conversion_id=pack.id,
            lead_time_days=3,
        ),
    )
    actor = await _actor(db_session, business, "lastprice")
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
                    supplier_product_id=product.id,
                    description="Gin case",
                    ordered_quantity=Decimal("1"),
                    unit_price=Decimal("240"),
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
    lines = await purchasing_service._lines(db_session, business.id, po.id)
    await purchasing_service.receive_purchase_order(
        db_session,
        business,
        po.id,
        actor.id,
        PurchaseReceiptCreate(
            idempotency_key="lastprice-hhhh",
            lines=[
                PurchaseReceiptLineCreate(
                    purchase_order_line_id=lines[0].id,
                    received_quantity=Decimal("1"),
                    unit_price=Decimal("252"),
                )
            ],
        ),
    )
    await db_session.refresh(product)
    # Per pack, matching the column's siblings -- not the per-ml derived cost.
    assert product.last_price == Decimal("252.000000")


@pytest.mark.asyncio
async def test_attachments_validate_type_and_size(db_session: AsyncSession, tmp_path):
    business = await _business(db_session, "attach")
    item, pack = await _bottled_item(db_session, business)
    actor, po = await _ordered_po(db_session, business, item, pack)

    with pytest.raises(purchasing_service.PurchasingError, match="PDF, JPEG or PNG"):
        await purchasing_service.add_attachment(
            db_session,
            business.id,
            po.id,
            actor.id,
            filename="notes.txt",
            content_type="text/plain",
            data=b"hello",
        )
    with pytest.raises(purchasing_service.PurchasingError, match="10 MB"):
        await purchasing_service.add_attachment(
            db_session,
            business.id,
            po.id,
            actor.id,
            filename="huge.pdf",
            content_type="application/pdf",
            data=b"x" * (purchasing_service.MAX_ATTACHMENT_BYTES + 1),
        )
    with pytest.raises(purchasing_service.PurchasingError, match="empty"):
        await purchasing_service.add_attachment(
            db_session,
            business.id,
            po.id,
            actor.id,
            filename="empty.pdf",
            content_type="application/pdf",
            data=b"",
        )


@pytest.mark.asyncio
async def test_attachment_round_trip_and_tenant_scope(db_session: AsyncSession):
    business = await _business(db_session, "attachok")
    other = await _business(db_session, "attachother")
    item, pack = await _bottled_item(db_session, business)
    actor, po = await _ordered_po(db_session, business, item, pack)

    attachment = await purchasing_service.add_attachment(
        db_session,
        business.id,
        po.id,
        actor.id,
        filename="delivery-note.pdf",
        content_type="application/pdf",
        data=b"%PDF-1.4 delivery",
    )
    # The stored key is storage-relative, never a public /uploads URL.
    assert not attachment.object_key.startswith("/uploads")
    assert attachment.byte_size == len(b"%PDF-1.4 delivery")

    _, data = await purchasing_service.read_attachment(
        db_session, business.id, po.id, attachment.id
    )
    assert data == b"%PDF-1.4 delivery"

    # Another tenant cannot read it even holding the ids.
    with pytest.raises(purchasing_service.PurchasingError, match="not found"):
        await purchasing_service.read_attachment(db_session, other.id, po.id, attachment.id)

    await purchasing_service.delete_attachment(db_session, business.id, po.id, attachment.id)
    assert await purchasing_service.list_attachments(db_session, business.id, po.id) == []


@pytest.mark.asyncio
async def test_receipt_response_carries_lines_and_resulting_order_status(
    db_session: AsyncSession,
):
    """The receipt payload the router returns must be buildable and complete.

    Regression guard: the service tests alone never exercised this, and the
    response builder ordered by a column the model did not map.
    """
    business = await _business(db_session, "receiptresp")
    item, pack = await _bottled_item(db_session, business)
    actor, po = await _ordered_po(db_session, business, item, pack, quantity="3")
    lines = await purchasing_service._lines(db_session, business.id, po.id)

    receipt, _ = await purchasing_service.receive_purchase_order(
        db_session,
        business,
        po.id,
        actor.id,
        PurchaseReceiptCreate(
            idempotency_key="response-key-iiii",
            delivery_reference="DN-9",
            lines=[
                PurchaseReceiptLineCreate(
                    purchase_order_line_id=lines[0].id,
                    received_quantity=Decimal("1"),
                    unit_price=Decimal("240"),
                )
            ],
        ),
    )
    payload = await purchasing_service.receipt_response(db_session, receipt)
    assert payload["business_id"] == business.id
    assert payload["delivery_reference"] == "DN-9"
    # The client must be able to tell whether this delivery closed the order.
    assert payload["purchase_order_status"] == "partially_received"
    assert len(payload["lines"]) == 1
    assert payload["lines"][0].received_quantity == Decimal("1.000")
