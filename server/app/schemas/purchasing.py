from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import AppBaseModel


class SupplierCreate(AppBaseModel):
    name: str = Field(min_length=1, max_length=255)
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None


class PurchaseOrderLineCreate(AppBaseModel):
    inventory_item_id: UUID
    pack_conversion_id: UUID
    description: str = Field(min_length=1, max_length=255)
    ordered_quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)


class PurchaseOrderCreate(AppBaseModel):
    supplier_id: UUID
    location_id: UUID | None = None
    reference: str | None = Field(default=None, max_length=120)
    expected_on: date | None = None
    note: str | None = None
    lines: list[PurchaseOrderLineCreate] = Field(min_length=1)


class PurchaseOrderStatusUpdate(AppBaseModel):
    status: str = Field(pattern="^(approved|ordered|cancelled)$")


class PurchaseReceiptLineCreate(AppBaseModel):
    purchase_order_line_id: UUID
    received_quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    substitution_note: str | None = None
    discrepancy_reason: str | None = None


class PurchaseReceiptCreate(AppBaseModel):
    idempotency_key: str = Field(min_length=1, max_length=100)
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


class PurchaseOrderLineResponse(AppBaseModel):
    id: UUID
    inventory_item_id: UUID
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
    lines: list[PurchaseOrderLineResponse]


class PurchaseReceiptResponse(AppBaseModel):
    id: UUID
    purchase_order_id: UUID
    delivery_reference: str | None = None
    invoice_reference: str | None = None
    received_at: datetime
