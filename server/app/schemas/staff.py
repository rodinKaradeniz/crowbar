from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class StaffCreate(BaseModel):
    user_id: UUID
    business_id: UUID
    role: str = "staff"


class StaffUpdate(BaseModel):
    role: str | None = None


class StaffResponse(BaseModel):
    id: UUID
    user_id: UUID
    business_id: UUID
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class StaffWithUserResponse(BaseModel):
    id: UUID
    user_id: UUID
    business_id: UUID
    role: str
    created_at: datetime
    user_name: str
    user_email: str
    user_phone: str | None = None

    model_config = {"from_attributes": True}


class StaffInviteRequest(BaseModel):
    email: EmailStr
    role: str = "staff"


class StaffInviteResponse(BaseModel):
    message: str


class InviteDetailsResponse(BaseModel):
    email: str
    role: str
    business_name: str


class AcceptInviteRequest(BaseModel):
    name: str
    password: str
