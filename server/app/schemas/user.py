from datetime import datetime
from uuid import UUID

from pydantic import EmailStr

from app.schemas.base import AppBaseModel


class UserCreate(AppBaseModel):
    email: EmailStr
    name: str
    phone: str | None = None
    password: str
    user_type: str = "customer"


class UserUpdate(AppBaseModel):
    name: str | None = None
    phone: str | None = None
    avatar: str | None = None


class ChangeEmailRequest(AppBaseModel):
    new_email: EmailStr
    password: str


class ChangePasswordRequest(AppBaseModel):
    current_password: str
    new_password: str


class UserResponse(AppBaseModel):
    id: UUID
    email: str
    name: str
    phone: str | None = None
    avatar: str | None = None
    user_type: str
    created_at: datetime

