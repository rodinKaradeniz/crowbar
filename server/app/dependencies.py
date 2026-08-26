from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.errors import ErrorCode, api_error
from app.core.permissions import CAPABILITIES, has_capability
from app.database import get_db
from app.models.business import Business
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": ErrorCode.UNAUTHORIZED, "message": "Not authenticated", "details": None},
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            audience="crowbar-staff-api",
        )
        if payload.get("token_use") != "staff_access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": ErrorCode.INVALID_TOKEN,
                    "message": "Invalid token",
                    "details": None,
                },
            )
        user_id: str | None = payload.get("sub")
        session_version = payload.get("session_version")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": ErrorCode.INVALID_TOKEN, "message": "Invalid token", "details": None},
            )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": ErrorCode.INVALID_TOKEN, "message": "Invalid token", "details": None},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if (
        user is None
        or not user.is_active
        or session_version != user.session_version
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": ErrorCode.UNAUTHORIZED, "message": "Session is no longer valid", "details": None},
        )

    return user


async def get_optional_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if token is None:
        return None

    try:
        return await get_current_user(token=token, db=db)
    except HTTPException:
        return None


async def get_current_business(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Business:
    """
    Resolve the business the current user belongs to (staff only).
    Reads from the user's staff_assignments loaded via selectin.
    Raises 403 if the user has no business association.
    """
    if not current_user.staff_assignments:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": ErrorCode.FORBIDDEN,
                "message": "User is not associated with any business",
                "details": None,
            },
        )

    business_id = current_user.staff_assignments[0].business_id
    result = await db.execute(select(Business).where(Business.id == business_id))
    business = result.scalar_one_or_none()

    if business is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": ErrorCode.FORBIDDEN, "message": "Business not found", "details": None},
        )

    return business


def current_staff_role(current_user: User) -> str | None:
    """The role the current user holds in the business they are acting for.

    One-business tenancy makes `staff_assignments[0]` unambiguous, and
    `get_current_business` derives the tenant from the same index, so the two
    cannot disagree. Generalizing this to multi-business accounts is an open
    decision in `docs/TODO.md`, not something to do incidentally.
    """
    if not current_user.staff_assignments:
        return None
    return current_user.staff_assignments[0].role


def require_capability(capability: str):
    """
    Dependency factory: require the current user's role to hold `capability`.

    This is the guard nearly every protected route should use. It states what
    the route does rather than who may reach it, so the role matrix lives in one
    place (`app/core/permissions.py`) instead of being re-derived at each call
    site.

    Usage:
        @router.post("/purchase-orders", dependencies=[
            Depends(require_capability("purchasing.order.create"))
        ])
    """
    if capability not in CAPABILITIES:
        raise ValueError(f"Unknown capability: {capability}")

    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        role = current_staff_role(current_user)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": ErrorCode.FORBIDDEN,
                    "message": "Insufficient permissions",
                    "details": None,
                },
            )
        if not has_capability(role, capability):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": ErrorCode.FORBIDDEN,
                    "message": f"Role '{role}' is not permitted to perform this action.",
                    "details": {
                        "required_capability": capability,
                        "current_role": role,
                    },
                },
            )
        return current_user

    return dependency


def require_module(module_name: str):
    """
    Dependency factory: require the current user's business to have a module enabled.

    Usage:
        @router.get("/menu", dependencies=[Depends(require_module("ordering"))])
    """
    async def dependency(business: Business = Depends(get_current_business)) -> None:
        enabled: list = business.enabled_modules or []
        if module_name not in enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": ErrorCode.MODULE_DISABLED,
                    "message": f"Module '{module_name}' is not enabled for this business",
                    "details": {"module": module_name},
                },
            )

    return dependency


def require_any_module(*module_names: str):
    """Require at least one of several cross-cutting product modules."""

    required = tuple(dict.fromkeys(module_names))
    if not required:
        raise ValueError("require_any_module needs at least one module")

    async def dependency(business: Business = Depends(get_current_business)) -> None:
        enabled = set(business.enabled_modules or [])
        if not enabled.intersection(required):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": ErrorCode.MODULE_DISABLED,
                    "message": "At least one operational module must be enabled",
                    "details": {"modules": list(required)},
                },
            )

    return dependency
