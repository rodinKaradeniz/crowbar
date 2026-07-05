from datetime import datetime
from uuid import UUID

from pydantic import EmailStr

from app.schemas.base import AppBaseModel


class StaffCreate(AppBaseModel):
    user_id: UUID
    business_id: UUID
    role: str = "staff"


class StaffUpdate(AppBaseModel):
    role: str | None = None


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
    role: str = "staff"


class StaffInviteResponse(AppBaseModel):
    message: str


class InviteDetailsResponse(AppBaseModel):
    email: str
    role: str
    business_name: str


class AcceptInviteRequest(AppBaseModel):
    name: str
    password: str
