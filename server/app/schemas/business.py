from datetime import datetime
from uuid import UUID


from app.schemas.base import AppBaseModel


class OperatingHoursEntry(AppBaseModel):
    open: str | None = None
    close: str | None = None
    closed: bool | None = None


class BusinessCreate(AppBaseModel):
    name: str
    slug: str
    email: str
    phone: str
    timezone: str = "UTC"
    country_code: str = "DE"
    currency_code: str = "EUR"
    locale: str = "de-DE"
    tax_label: str = "VAT"
    address: str | None = None
    description: str | None = None
    image: str | None = None
    website: str | None = None
    tags: list[str] | None = None
    max_guests: int = 10
    reservation_time: int = 60
    time_slot_interval: int = 15
    advance_booking_days: int = 30
    operating_hours: dict[str, OperatingHoursEntry] = {}


class BusinessUpdate(AppBaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    timezone: str | None = None
    country_code: str | None = None
    currency_code: str | None = None
    locale: str | None = None
    tax_label: str | None = None
    address: str | None = None
    description: str | None = None
    image: str | None = None
    website: str | None = None
    tags: list[str] | None = None
    max_guests: int | None = None
    reservation_time: int | None = None
    time_slot_interval: int | None = None
    advance_booking_days: int | None = None
    operating_hours: dict[str, OperatingHoursEntry] | None = None
    enabled_modules: list[str] | None = None
    notification_channels: list[str] | None = None
    legal_drinking_age: int | None = None
    public_reservations_enabled: bool | None = None


class BusinessResponse(AppBaseModel):
    id: UUID
    name: str
    slug: str
    email: str
    phone: str
    timezone: str = "UTC"
    country_code: str = "DE"
    currency_code: str = "EUR"
    locale: str = "de-DE"
    tax_label: str = "VAT"
    legal_drinking_age: int = 18
    address: str | None = None
    description: str | None = None
    image: str | None = None
    website: str | None = None
    tags: list[str] | None = None
    max_guests: int
    reservation_time: int
    time_slot_interval: int
    advance_booking_days: int
    operating_hours: dict
    enabled_modules: list[str] = []
    onboarding_complete: bool = False
    notification_channels: list[str] = ["email"]
    is_accepting_orders: bool = True
    public_reservations_enabled: bool = True
    created_at: datetime


class PublicBusinessResponse(AppBaseModel):
    id: UUID
    name: str
    slug: str
    email: str
    phone: str
    timezone: str = "UTC"
    country_code: str = "DE"
    currency_code: str = "EUR"
    locale: str = "de-DE"
    tax_label: str = "VAT"
    legal_drinking_age: int = 18
    address: str | None = None
    description: str | None = None
    image: str | None = None
    website: str | None = None
    tags: list[str] | None = None
    max_guests: int
    reservation_time: int
    time_slot_interval: int
    advance_booking_days: int
    operating_hours: dict
    public_reservations_enabled: bool = True
    created_at: datetime
