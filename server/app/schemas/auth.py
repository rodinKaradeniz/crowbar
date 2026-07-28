from pydantic import EmailStr

from app.schemas.base import AppBaseModel


class LoginRequest(AppBaseModel):
    email: EmailStr
    password: str


class RegisterRequest(AppBaseModel):
    email: EmailStr
    password: str
    name: str
    phone: str | None = None
    user_type: str = "customer"


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
