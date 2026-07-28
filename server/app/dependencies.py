from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.errors import ErrorCode, api_error
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
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        if payload.get("token_use") == "websocket":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": ErrorCode.INVALID_TOKEN,
                    "message": "Invalid token",
                    "details": None,
                },
            )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": ErrorCode.INVALID_TOKEN, "message": "Invalid token", "details": None},
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": ErrorCode.INVALID_TOKEN, "message": "Invalid token", "details": None},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": ErrorCode.UNAUTHORIZED, "message": "User not found", "details": None},
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


def require_roles(*roles: str):
    """
    Dependency factory: require the current user to have one of the given roles.

    Usage:
        @router.delete("/{id}", dependencies=[Depends(require_roles("owner", "manager"))])
    """
    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        if not current_user.staff_assignments:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": ErrorCode.FORBIDDEN,
                    "message": "Insufficient permissions",
                    "details": None,
                },
            )
        staff = current_user.staff_assignments[0]
        if staff.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": ErrorCode.FORBIDDEN,
                    "message": f"Role '{staff.role}' is not permitted. Required: {list(roles)}",
                    "details": {"required_roles": list(roles), "current_role": staff.role},
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
