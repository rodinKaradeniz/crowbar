from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import AppBaseModel

# Purchase order and receipt quantities count PACKS and their prices are per
# pack. Only `PurchasePriceHistoryEntry` is per canonical base unit.


class SupplierCreate(AppBaseModel):
    name: str = Field(min_length=1, max_length=255)
    contact_name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = None
    notes: str | None = None


class SupplierUpdate(AppBaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    contact_name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = None
    notes: str | None = None


class SupplierProductCreate(AppBaseModel):
    inventory_item_id: UUID
    product_name: str = Field(min_length=1, max_length=255)
    supplier_sku: str | None = Field(default=None, max_length=120)
    pack_conversion_id: UUID | None = None
    lead_time_days: int = Field(default=0, ge=0, le=365)
    last_price: Decimal | None = Field(default=None, ge=0)


class SupplierProductUpdate(AppBaseModel):
    product_name: str | None = Field(default=None, min_length=1, max_length=255)
    supplier_sku: str | None = Field(default=None, max_length=120)
    pack_conversion_id: UUID | None = None
    lead_time_days: int | None = Field(default=None, ge=0, le=365)
    last_price: Decimal | None = Field(default=None, ge=0)


class PurchaseOrderLineCreate(AppBaseModel):
    inventory_item_id: UUID
    pack_conversion_id: UUID
    description: str = Field(min_length=1, max_length=255)
    ordered_quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    supplier_product_id: UUID | None = None


class PurchaseOrderCreate(AppBaseModel):
    supplier_id: UUID
    location_id: UUID | None = None
    reference: str | None = Field(default=None, max_length=120)
    expected_on: date | None = None
    note: str | None = None
    lines: list[PurchaseOrderLineCreate] = Field(min_length=1)


class PurchaseOrderStatusUpdate(AppBaseModel):
    # `closed_short` ends an order the supplier will not complete without
    # claiming, as `cancelled` would, that nothing was ever received.
    status: str = Field(pattern="^(approved|ordered|received|closed_short|cancelled)$")
    closure_reason: str | None = Field(default=None, max_length=500)


class PurchaseReceiptLineCreate(AppBaseModel):
    purchase_order_line_id: UUID
    received_quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    substitution_note: str | None = None
    discrepancy_reason: str | None = None


class PurchaseReceiptCreate(AppBaseModel):
    idempotency_key: str = Field(min_length=8, max_length=100)
    delivery_reference: str | None = Field(default=None, max_length=120)
    invoice_reference: str | None = Field(default=None, max_length=120)
    note: str | None = None
    lines: list[PurchaseReceiptLineCreate] = Field(min_length=1)


class SupplierResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    name: str
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SupplierProductResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    supplier_id: UUID
    inventory_item_id: UUID
    supplier_sku: str | None = None
    product_name: str
    pack_conversion_id: UUID | None = None
    lead_time_days: int
    last_price: Decimal | None = None
    currency_code: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PurchaseOrderLineResponse(AppBaseModel):
    id: UUID
    inventory_item_id: UUID
    supplier_product_id: UUID | None = None
    description: str
    ordered_quantity: Decimal
    received_quantity: Decimal
    pack_conversion_id: UUID
    unit_price: Decimal
    currency_code: str


class PurchaseOrderResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    supplier_id: UUID
    location_id: UUID | None = None
    status: str
    reference: str | None = None
    expected_on: date | None = None
    note: str | None = None
    approved_by: UUID | None = None
    approved_at: datetime | None = None
    ordered_at: datetime | None = None
    closed_at: datetime | None = None
    closed_by: UUID | None = None
    closure_reason: str | None = None
    lines: list[PurchaseOrderLineResponse]


class PurchaseReceiptLineResponse(AppBaseModel):
    id: UUID
    purchase_order_line_id: UUID
    inventory_item_id: UUID
    received_quantity: Decimal
    unit_price: Decimal
    currency_code: str
    substitution_note: str | None = None
    discrepancy_reason: str | None = None
    stock_movement_id: UUID | None = None


class PurchaseReceiptResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    purchase_order_id: UUID
    delivery_reference: str | None = None
    invoice_reference: str | None = None
    received_at: datetime
    note: str | None = None
    # The receipt is what moves the order's status, so the client should not
    # have to re-fetch the order to find out whether this delivery closed it.
    purchase_order_status: str
    lines: list[PurchaseReceiptLineResponse]


class PurchasePriceHistoryEntry(AppBaseModel):
    """One observed cost, per canonical base unit -- not per pack."""

    id: UUID
    inventory_item_id: UUID
    supplier_product_id: UUID | None = None
    receipt_line_id: UUID | None = None
    unit_cost_per_base_unit: Decimal
    currency_code: str
    observed_at: datetime


class PurchaseOrderAttachmentResponse(AppBaseModel):
    id: UUID
    purchase_order_id: UUID
    filename: str
    content_type: str | None = None
    byte_size: int | None = None
    uploaded_by: UUID | None = None
    created_at: datetime
