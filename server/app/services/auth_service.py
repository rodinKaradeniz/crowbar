from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.business import Business
from app.models.location import Location
from app.models.staff import Staff
from app.models.user import User
from app.services.booking_schedule_service import create_default_booking_schedule


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")


def create_access_token(user_id: str, user_type: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    to_encode = {
        "sub": user_id,
        "user_type": user_type,
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


WEBSOCKET_TOKEN_TTL_SECONDS = 120


def create_websocket_token(user_id: str, business_id: str) -> str:
    """Create a short-lived token that is valid only for staff WebSockets."""
    expire = datetime.now(timezone.utc) + timedelta(
        seconds=WEBSOCKET_TOKEN_TTL_SECONDS
    )
    return jwt.encode(
        {
            "sub": user_id,
            "business_id": business_id,
            "token_use": "websocket",
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

    if user is None or not verify_password(password, user.password_hash):
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
) -> tuple[User, Business]:
    """Register a business owner: creates user + business + staff assignment in one transaction."""
    # 1. Create the staff user
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
    )
    db.add(business)
    await db.flush()
    await create_default_booking_schedule(db, business)

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
