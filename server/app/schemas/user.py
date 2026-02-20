from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    phone: str | None = None
    password: str
    user_type: str = "customer"


class UserUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    avatar: str | None = None


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    phone: str | None = None
    avatar: str | None = None
    user_type: str
    created_at: datetime

    model_config = {"from_attributes": True}
