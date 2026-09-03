import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy import delete, select
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

logger = logging.getLogger(__name__)

PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128

#: How long a deletion request sits before the job erases it. Signing in during
#: the window cancels the request.
DELETION_GRACE_DAYS = 30

#: What an erased user's audit trails resolve to. docs/TODO.md uses the same
#: phrase, and customer_service's "Deleted guest" is the guest-side sibling.
ANONYMIZED_USER_NAME = "Former staff member"


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
        "aud": "crowbar-staff-api",
        "token_use": "staff_access",
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
            "aud": "crowbar-staff-websocket",
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

    # Signing in cancels a pending erasure. There is no second endpoint for it,
    # and no session_version bump on the request, precisely so that this is
    # reachable: an account with a pending request keeps working, and using it
    # is how you say you changed your mind.
    if user.deletion_requested_at is not None:
        user.deletion_requested_at = None

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


async def anonymize_user(db: AsyncSession, user: User, *, now: datetime | None = None) -> None:
    """Erase the person and keep the row, following customer_service.anonymize_customer.

    The 48 foreign keys pointing at users(id) are left exactly as they are: the
    audit trails still resolve, and they resolve to a row that identifies nobody.
    """
    now = now or datetime.now(timezone.utc)
    user.email = f"deleted-{user.id}@deleted.invalid"
    user.name = ANONYMIZED_USER_NAME
    # NOT NULL, and the real hash is personal data of a kind. It has to be
    # replaced by something that cannot verify, but bcrypt.checkpw raises on a
    # malformed hash, so a real bcrypt hash of a secret nobody keeps is the
    # erasure -- anything else turns a later sign-in attempt into a 500.
    # 32 bytes, not more: bcrypt.hashpw refuses an input over 72 bytes outright
    # rather than truncating it, and token_urlsafe(64) is 86 characters.
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    user.phone = None
    user.avatar = None
    user.is_active = False
    user.session_version += 1
    user.anonymized_at = now
    # Access ends with the staff rows. This costs nothing: the audit trails
    # point at users.id, never at staff.id.
    await db.execute(delete(Staff).where(Staff.user_id == user.id))
    await db.flush()


async def anonymize_due_users(db: AsyncSession, *, now: datetime | None = None) -> int:
    """Erase every user whose grace window has run out; suitable for a daily job."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    cutoff = now - timedelta(days=DELETION_GRACE_DAYS)
    users = list(
        (
            await db.scalars(
                select(User).where(
                    User.deletion_requested_at.is_not(None),
                    User.deletion_requested_at < cutoff,
                    User.anonymized_at.is_(None),
                )
            )
        ).all()
    )
    anonymized = 0
    for user in users:
        stranded = await staff_service.sole_owner_business_ids(db, user.id)
        if stranded:
            # Someone became the last owner after asking. Erasing them would
            # leave a business nobody can sign in to, so the request stays
            # pending until ownership moves.
            logger.warning(
                "account erasure skipped user=%s sole_owner_of=%s",
                user.id,
                [str(business_id) for business_id in stranded],
            )
            continue
        await anonymize_user(db, user, now=now)
        anonymized += 1
    return anonymized


# These sit at the foot rather than the head because app/schemas/auth.py imports
# validate_password back out of this module: every one of them reaches
# app.schemas, so importing them before validate_password exists makes
# `import app.services.auth_service` fail outright. That was already true of the
# two service imports before account deletion was added -- it only surfaced when
# app/jobs/account_deletion.py made this module the first one an entry point
# imports. Same reason as the deferred imports at the foot of app/models/.
from app.services import staff_service  # noqa: E402
from app.services.booking_schedule_service import (  # noqa: E402
    create_default_booking_schedule,
)
from app.services.tax_service import create_default_profiles  # noqa: E402
