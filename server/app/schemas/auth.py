from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: str | None = None
    user_type: str = "customer"


class BusinessRegisterRequest(BaseModel):
    """Register a new business owner: creates user + business + staff assignment."""
    email: EmailStr
    password: str
    name: str  # owner's personal name
    phone: str
    business_name: str
    business_slug: str
    business_address: str | None = None
    business_description: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    user_type: str


class TokenData(BaseModel):
    sub: str
    user_type: str
