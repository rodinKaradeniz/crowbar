from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import EmailStr, field_validator

from app.schemas.base import AppBaseModel
from app.services.auth_service import validate_password


StaffRole = Literal["owner", "manager", "staff"]


class StaffCreate(AppBaseModel):
    user_id: UUID
    role: StaffRole = "staff"


class StaffUpdate(AppBaseModel):
    role: StaffRole


class StaffResponse(AppBaseModel):
    id: UUID
    user_id: UUID
    business_id: UUID
    role: str
    created_at: datetime



class StaffWithUserResponse(AppBaseModel):
    id: UUID
    user_id: UUID
    business_id: UUID
    role: str
    created_at: datetime
    user_name: str
    user_email: str
    user_phone: str | None = None



class StaffInviteRequest(AppBaseModel):
    email: EmailStr
    role: StaffRole = "staff"


class StaffInviteResponse(AppBaseModel):
    id: UUID
    email: str
    role: StaffRole
    expires_at: datetime
    accepted_at: datetime | None = None
    revoked_at: datetime | None = None
    sent_at: datetime | None = None
    delivery_status: Literal["pending", "sent", "failed"]
    delivery_error: str | None = None


class InviteDetailsResponse(AppBaseModel):
    email: str
    role: str
    business_name: str


class AcceptInviteRequest(AppBaseModel):
    name: str
    password: str

    _valid_password = field_validator("password")(validate_password)
