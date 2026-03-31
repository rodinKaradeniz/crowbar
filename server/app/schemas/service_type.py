from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class FormFieldDefinition(BaseModel):
    """Schema for a single custom form field definition."""
    id: str
    label: str
    type: str  # text, textarea, number, email, phone, date, time, select, checkbox
    required: bool = False
    placeholder: str | None = None
    options: list[str] | None = None  # for select type
    min: float | None = None  # for number type
    max: float | None = None  # for number type
    max_length: int | None = None  # for text/textarea
    order: int = 0
    system: bool = False  # True for system fields (date, time, email, phone, guests)


class ServiceTypeCreate(BaseModel):
    business_id: UUID
    name: str
    description: str | None = None
    capacity: int = 1
    max_concurrent_bookings: int | None = None
    requires_payment: bool = False
    amount: float | None = None
    is_online: bool = False
    is_pending_enabled: bool = True
    duration: int | None = None
    color: str = "#3b82f6"
    display_order: int | None = None
    image: str | None = None
    form_fields: list[FormFieldDefinition] | None = None


class ServiceTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    capacity: int | None = None
    max_concurrent_bookings: int | None = None
    requires_payment: bool | None = None
    amount: float | None = None
    is_online: bool | None = None
    is_pending_enabled: bool | None = None
    duration: int | None = None
    color: str | None = None
    display_order: int | None = None
    image: str | None = None
    form_fields: list[FormFieldDefinition] | None = None


class ServiceTypeResponse(BaseModel):
    id: UUID
    business_id: UUID
    name: str
    description: str | None = None
    capacity: int
    max_concurrent_bookings: int | None = None
    requires_payment: bool
    amount: float | None = None
    is_online: bool
    is_pending_enabled: bool
    duration: int | None = None
    color: str
    display_order: int | None = None
    image: str | None = None
    form_fields: list[FormFieldDefinition] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
