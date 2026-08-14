import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.regional import (
    normalize_phone,
    validate_country_code,
    validate_currency_code,
    validate_locale,
    validate_tax_label,
    validate_timezone,
)
from app.models.business import Business
from app.models.location import Location
from app.models.password_reset_token import PasswordResetToken
from app.models.staff import Staff
from app.models.user import User
from app.services.booking_schedule_service import create_default_booking_schedule
from app.services.tax_service import create_default_profiles


PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128


def validate_password(password: str) -> str:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(
            f"Password must be at least {PASSWORD_MIN_LENGTH} characters"
        )
    if len(password) > PASSWORD_MAX_LENGTH:
        raise ValueError(
            f"Password must be at most {PASSWORD_MAX_LENGTH} characters"
        )
    return password


def hash_opaque_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")


def create_access_token(
    user_id: str, user_type: str, session_version: int = 1
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    to_encode = {
        "sub": user_id,
        "user_type": user_type,
        "session_version": session_version,
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


WEBSOCKET_TOKEN_TTL_SECONDS = 120


def create_websocket_token(
    user_id: str, business_id: str, session_version: int = 1
) -> str:
    """Create a short-lived token that is valid only for staff WebSockets."""
    expire = datetime.now(timezone.utc) + timedelta(
        seconds=WEBSOCKET_TOKEN_TTL_SECONDS
    )
    return jwt.encode(
        {
            "sub": user_id,
            "business_id": business_id,
            "token_use": "websocket",
            "session_version": session_version,
            "exp": expire,
        },
        settings.secret_key,
        algorithm=settings.algorithm,
    )


async def authenticate_user(
    db: AsyncSession, email: str, password: str
) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if (
        user is None
        or not user.is_active
        or user.user_type != "staff"
        or not verify_password(password, user.password_hash)
    ):
        return None

    return user


async def register_user(
    db: AsyncSession,
    email: str,
    password: str,
    name: str,
    phone: str | None = None,
    user_type: str = "customer",
) -> User:
    validate_password(password)
    user = User(
        email=email,
        name=name,
        phone=phone,
        password_hash=hash_password(password),
        user_type=user_type,
    )
    db.add(user)
    await db.flush()
    return user


async def register_business_owner(
    db: AsyncSession,
    email: str,
    password: str,
    name: str,
    phone: str,
    business_name: str,
    business_slug: str,
    business_address: str | None = None,
    business_description: str | None = None,
    country_code: str = "DE",
    currency_code: str = "EUR",
    locale: str = "de-DE",
    timezone: str = "Europe/Berlin",
    tax_label: str = "VAT",
) -> tuple[User, Business]:
    """Register a business owner: creates user + business + staff assignment in one transaction."""
    validate_password(password)
    # 1. Create the staff user
    country_code = validate_country_code(country_code)
    currency_code = validate_currency_code(currency_code)
    locale = validate_locale(locale)
    timezone = validate_timezone(timezone)
    tax_label = validate_tax_label(tax_label)
    phone = normalize_phone(phone, country_code) or phone

    user = User(
        email=email,
        name=name,
        phone=phone,
        password_hash=hash_password(password),
        user_type="staff",
    )
    db.add(user)
    await db.flush()

    # 2. Create the business
    business = Business(
        name=business_name,
        slug=business_slug,
        email=email,
        phone=phone,
        address=business_address,
        description=business_description,
        country_code=country_code,
        currency_code=currency_code,
        locale=locale,
        timezone=timezone,
        tax_label=tax_label,
    )
    db.add(business)
    await db.flush()
    await create_default_booking_schedule(db, business)
    await create_default_profiles(db, business, actor_id=user.id)

    db.add(
        Location(
            business_id=business.id,
            name=business.name,
            address=business.address,
            phone=business.phone,
            is_primary=True,
        )
    )
    await db.flush()

    # 3. Assign the user as owner of the business
    staff = Staff(
        user_id=user.id,
        business_id=business.id,
        role="owner",
    )
    db.add(staff)
    await db.flush()

    return user, business


async def create_password_reset(
    db: AsyncSession, user: User
) -> tuple[PasswordResetToken, str]:
    now = datetime.now(timezone.utc)
    active_tokens = await db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
    )
    for existing in active_tokens:
        existing.used_at = now

    raw_token = secrets.token_urlsafe(32)
    reset = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_opaque_token(raw_token),
        expires_at=now + timedelta(minutes=30),
    )
    db.add(reset)
    await db.flush()
    return reset, raw_token


async def consume_password_reset(
    db: AsyncSession, raw_token: str, new_password: str
) -> User | None:
    validate_password(new_password)
    now = datetime.now(timezone.utc)
    reset = await db.scalar(
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == hash_opaque_token(raw_token))
        .with_for_update()
    )
    if reset is None or reset.used_at is not None or reset.expires_at <= now:
        return None

    user = await db.scalar(
        select(User).where(User.id == reset.user_id).with_for_update()
    )
    if user is None or not user.is_active:
        return None

    reset.used_at = now
    user.password_hash = hash_password(new_password)
    user.session_version += 1
    await db.flush()
    return user
