import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class Supplier(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "suppliers"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class SupplierProduct(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "supplier_products"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    supplier_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    supplier_sku: Mapped[str | None] = mapped_column(String(120))
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    pack_conversion_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    lead_time_days: Mapped[int] = mapped_column(default=0, nullable=False)
    last_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class PurchaseOrder(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "purchase_orders"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    supplier_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    location_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    reference: Mapped[str | None] = mapped_column(String(120))
    expected_on: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ordered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    closure_reason: Mapped[str | None] = mapped_column(Text)


class PurchaseOrderLine(Base, UUIDMixin, TimestampMixin):
    """A quantity of one inventory item ordered in a specific pack.

    `ordered_quantity` and `received_quantity` count PACKS, not base units, and
    `unit_price` is the price of one pack. Base-unit quantities and per-base-unit
    costs are derived at receipt by multiplying and dividing by the pack
    conversion's `base_quantity`.
    """

    __tablename__ = "purchase_order_lines"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    supplier_product_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    ordered_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    received_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=0, nullable=False)
    pack_conversion_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)


class PurchaseReceipt(Base, UUIDMixin):
    __tablename__ = "purchase_receipts"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    delivery_reference: Mapped[str | None] = mapped_column(String(120))
    invoice_reference: Mapped[str | None] = mapped_column(String(120))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    received_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    request_fingerprint: Mapped[str | None] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(Text)


class PurchaseReceiptLine(Base, UUIDMixin):
    """What actually arrived against one purchase order line.

    `received_quantity` counts PACKS and `unit_price` is per pack, matching the
    ordered line. The per-base-unit cost that reaches the stock ledger lives on
    the resulting movement and on `PurchasePriceHistory`.
    """

    __tablename__ = "purchase_receipt_lines"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    receipt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    purchase_order_line_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    received_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    substitution_note: Mapped[str | None] = mapped_column(Text)
    discrepancy_reason: Mapped[str | None] = mapped_column(Text)
    stock_movement_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PurchasePriceHistory(Base, UUIDMixin):
    """An observed supplier cost, normalized to the item's canonical base unit.

    Unlike the order and receipt lines, this row is per BASE unit (each/ml/g).
    Comparing it against a line's `unit_price` without dividing by the pack
    conversion is an error proportional to the pack size.
    """

    __tablename__ = "purchase_price_history"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    supplier_product_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    receipt_line_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    unit_cost_per_base_unit: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PurchaseOrderAttachment(Base, UUIDMixin):
    """A delivery note or supplier invoice image filed against a purchase order.

    `object_key` is a storage-relative path, never a public URL: attachments are
    tenant data and are served through an authenticated route rather than the
    public `/uploads` mount.
    """

    __tablename__ = "purchase_order_attachments"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    object_key: Mapped[str] = mapped_column(Text, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(120))
    byte_size: Mapped[int | None] = mapped_column(BigInteger)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
