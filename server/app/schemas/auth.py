from pydantic import EmailStr, field_validator

from app.schemas.base import AppBaseModel
from app.services.auth_service import validate_password


class LoginRequest(AppBaseModel):
    email: EmailStr
    password: str


class RegisterRequest(AppBaseModel):
    email: EmailStr
    password: str
    name: str
    phone: str | None = None
    user_type: str = "customer"

    _valid_password = field_validator("password")(validate_password)


class BusinessRegisterRequest(AppBaseModel):
    """Register a new business owner: creates user + business + staff assignment."""
    email: EmailStr
    password: str
    name: str  # owner's personal name
    phone: str
    business_name: str
    business_slug: str
    business_address: str | None = None
    business_description: str | None = None
    country_code: str = "DE"
    currency_code: str = "EUR"
    locale: str = "de-DE"
    timezone: str = "Europe/Berlin"
    tax_label: str = "VAT"

    _valid_password = field_validator("password")(validate_password)


class ForgotPasswordRequest(AppBaseModel):
    email: EmailStr


class ResetPasswordRequest(AppBaseModel):
    new_password: str

    _valid_password = field_validator("new_password")(validate_password)


class LoginResponse(AppBaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    user_type: str


class TokenData(AppBaseModel):
    sub: str
    user_type: str


class WebSocketTokenResponse(AppBaseModel):
    token: str
    expires_in: int
