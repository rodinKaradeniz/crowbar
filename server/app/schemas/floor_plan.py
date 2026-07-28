from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.schemas.base import AppBaseModel


TableShape = Literal["round", "square", "rectangle", "bar", "booth"]
OperationalState = Literal["ready", "cleaning", "out_of_service"]
SeatingSource = Literal["reservation", "queue"]


class AreaCreate(AppBaseModel):
    location_id: UUID | None = None
    name: str = Field(min_length=1, max_length=100)
    sort_order: int = 0

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()


class AreaUpdate(AppBaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    sort_order: int | None = None
    is_active: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class AreaResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID
    name: str
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TableCreate(AppBaseModel):
    area_id: UUID
    label: str = Field(min_length=1, max_length=100)
    capacity: int = Field(default=2, ge=1, le=100)
    shape: TableShape = "square"
    sort_order: int = 0

    @field_validator("label", mode="before")
    @classmethod
    def strip_label(cls, value: str) -> str:
        return value.strip()


class TableUpdate(AppBaseModel):
    area_id: UUID | None = None
    label: str | None = Field(default=None, min_length=1, max_length=100)
    capacity: int | None = Field(default=None, ge=1, le=100)
    shape: TableShape | None = None
    sort_order: int | None = None

    @field_validator("label", mode="before")
    @classmethod
    def strip_label(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class TableStateUpdate(AppBaseModel):
    state: OperationalState
    reason: str | None = Field(default=None, max_length=500)
    until: datetime | None = None

    @field_validator("reason", mode="before")
    @classmethod
    def strip_reason(cls, value: str | None) -> str | None:
        stripped = value.strip() if value is not None else None
        return stripped or None

    @model_validator(mode="after")
    def require_out_of_service_reason(self):
        if self.state == "out_of_service" and not self.reason:
            raise ValueError("A reason is required when taking a table out of service")
        return self


class TableResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID
    area_id: UUID
    label: str
    capacity: int
    shape: str
    sort_order: int
    operational_state: str
    operational_state_reason: str | None = None
    operational_state_until: datetime | None = None
    operational_state_changed_by: UUID | None = None
    operational_state_changed_at: datetime
    qr_token_revision: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CombinationCreate(AppBaseModel):
    name: str = Field(min_length=1, max_length=100)
    table_ids: list[UUID] = Field(min_length=2)
    capacity_override: int | None = Field(default=None, ge=1, le=200)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("table_ids")
    @classmethod
    def unique_tables(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("Combination tables must be unique")
        return value


class CombinationUpdate(AppBaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    table_ids: list[UUID] | None = Field(default=None, min_length=2)
    capacity_override: int | None = Field(default=None, ge=1, le=200)
    is_active: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("table_ids")
    @classmethod
    def unique_tables(cls, value: list[UUID] | None) -> list[UUID] | None:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("Combination tables must be unique")
        return value


class CombinationResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID
    area_id: UUID
    name: str
    table_ids: list[UUID]
    capacity_override: int | None = None
    effective_capacity: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TableAssignmentReplace(AppBaseModel):
    table_ids: list[UUID] = Field(min_length=1)
    capacity_override_reason: str | None = Field(
        default=None, min_length=10, max_length=500
    )

    @field_validator("table_ids")
    @classmethod
    def unique_tables(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("Assigned tables must be unique")
        return value

    @field_validator("capacity_override_reason", mode="before")
    @classmethod
    def strip_reason(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class TableAssignmentResponse(AppBaseModel):
    source_type: SeatingSource
    source_id: UUID
    table_ids: list[UUID]
    assigned_by: UUID | None = None
    assigned_at: datetime
    capacity: int
    capacity_override_reason: str | None = None


class SeatingOpen(AppBaseModel):
    source_type: SeatingSource
    source_id: UUID
    table_ids: list[UUID] = Field(min_length=1)
    capacity_override_reason: str | None = Field(
        default=None, min_length=10, max_length=500
    )

    @field_validator("table_ids")
    @classmethod
    def unique_tables(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("Seating tables must be unique")
        return value


class SeatingResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    location_id: UUID
    source_type: SeatingSource
    source_id: UUID
    table_ids: list[UUID]
    party_size: int
    status: str
    opened_by: UUID | None = None
    opened_at: datetime
    closed_by: UUID | None = None
    closed_at: datetime | None = None


class FloorPlanSettingsUpdate(AppBaseModel):
    service_day_cutoff: time

    @field_validator("service_day_cutoff")
    @classmethod
    def require_wall_clock_time(cls, value: time) -> time:
        if value.tzinfo is not None:
            raise ValueError("Service-day cutoff must be a local wall-clock time")
        return value


class FloorPlanSettingsResponse(AppBaseModel):
    service_day_cutoff: time
    timezone: str


class BoardPartyResponse(AppBaseModel):
    source_type: SeatingSource
    source_id: UUID
    name: str
    party_size: int
    status: str
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    assigned_table_ids: list[UUID]


class BoardSeatingResponse(AppBaseModel):
    seating_id: UUID
    source: BoardPartyResponse
    table_ids: list[UUID]
    opened_at: datetime


class BoardTableResponse(AppBaseModel):
    id: UUID
    area_id: UUID
    label: str
    capacity: int
    shape: str
    sort_order: int
    display_state: Literal[
        "available", "reserved", "occupied", "cleaning", "out_of_service"
    ]
    operational_state: str
    operational_state_reason: str | None = None
    operational_state_until: datetime | None = None
    operational_state_expired: bool = False
    active_seating: BoardSeatingResponse | None = None
    active_assignment: BoardPartyResponse | None = None
    next_reservation: BoardPartyResponse | None = None


class BoardAreaResponse(AppBaseModel):
    id: UUID
    name: str
    sort_order: int
    tables: list[BoardTableResponse]


class FloorPlanBoardResponse(AppBaseModel):
    business_id: UUID
    location_id: UUID
    timezone: str
    service_date: date
    starts_at: datetime
    ends_at: datetime
    generated_at: datetime
    areas: list[BoardAreaResponse]
    unassigned_reservations: list[BoardPartyResponse]
    queue_entries: list[BoardPartyResponse]
