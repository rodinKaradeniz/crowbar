from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, field_validator

from app.schemas.base import AppBaseModel
from app.services.auth_service import validate_password


class UserCreate(AppBaseModel):
    email: EmailStr
    name: str
    phone: str | None = None
    password: str
    user_type: str = "customer"

    _valid_password = field_validator("password")(validate_password)


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

    _valid_password = field_validator("new_password")(validate_password)


class UserResponse(AppBaseModel):
    id: UUID
    email: str
    name: str
    phone: str | None = None
    avatar: str | None = None
    user_type: str
    created_at: datetime
    #: Set while a 30-day account deletion window is running (migration 052).
    deletion_requested_at: datetime | None = None
