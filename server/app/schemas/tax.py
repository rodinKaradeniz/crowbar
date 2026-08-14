from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import AppBaseModel


class RegionalAuditResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    changed_by: UUID | None = None
    previous_values: dict
    new_values: dict
    changed_at: datetime


class TaxProfileVersionCreate(AppBaseModel):
    name: str = Field(min_length=1, max_length=120)
    rate: Decimal = Field(ge=0, le=100, max_digits=7, decimal_places=4)
    price_includes_tax: bool = True
    effective_from: datetime | None = None
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("name", "note", mode="before")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class TaxProfileCreate(TaxProfileVersionCreate):
    code: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()


class TaxProfileVersionResponse(AppBaseModel):
    id: UUID
    tax_profile_id: UUID
    business_id: UUID
    name: str
    rate: Decimal
    price_includes_tax: bool
    effective_from: datetime
    note: str | None = None
    created_by: UUID | None = None
    created_at: datetime


class TaxProfileResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    code: str
    is_active: bool
    created_by: UUID | None = None
    archived_by: UUID | None = None
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    current_version: TaxProfileVersionResponse | None = None
    versions: list[TaxProfileVersionResponse] = []


class RegionalOption(AppBaseModel):
    code: str
    name: str


class RegionalOptionsResponse(AppBaseModel):
    countries: list[RegionalOption]
    currencies: list[RegionalOption]


class RegionalSuggestionResponse(AppBaseModel):
    country_code: str
    currency_code: str
    locale: str
    tax_label: str
