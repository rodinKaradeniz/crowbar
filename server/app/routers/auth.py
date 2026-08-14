from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.rate_limit import (
    ACCOUNT_REGISTRATION_IP_LIMIT,
    LOGIN_IDENTITY_LIMIT,
    LOGIN_IP_LIMIT,
    PASSWORD_RESET_IDENTITY_LIMIT,
    PASSWORD_RESET_IP_LIMIT,
    RateLimitCheck,
    enforce_rate_limits,
    get_client_ip,
)
from app.database import get_db
from app.dependencies import get_current_business, get_current_user
from app.models.business import Business
from app.models.user import User
from app.schemas.auth import (
    BusinessRegisterRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    ResetPasswordRequest,
    WebSocketTokenResponse,
)
from app.schemas.user import ChangeEmailRequest, ChangePasswordRequest, UserResponse, UserUpdate
from app.services.auth_service import (
    authenticate_user,
    consume_password_reset,
    create_access_token,
    create_websocket_token,
    create_password_reset,
    hash_password,
    register_business_owner,
    verify_password,
    WEBSOCKET_TOKEN_TTL_SECONDS,
)
from app.services import staff_service
from app.services.email_service import send_password_reset

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/ws-token", response_model=WebSocketTokenResponse)
async def issue_websocket_token(
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    return WebSocketTokenResponse(
        token=create_websocket_token(
            str(current_user.id),
            str(business.id),
            current_user.session_version,
        ),
        expires_in=WEBSOCKET_TOKEN_TTL_SECONDS,
    )


@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = get_client_ip(request)
    await enforce_rate_limits(
        RateLimitCheck(
            policy=LOGIN_IP_LIMIT,
            key_parts=(client_ip,),
        ),
        RateLimitCheck(
            policy=LOGIN_IDENTITY_LIMIT,
            key_parts=(client_ip, str(data.email).strip().casefold()),
        ),
    )

    user = await authenticate_user(db, data.email, data.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(
        str(user.id), user.user_type, user.session_version
    )
    return LoginResponse(
        access_token=token,
        user_id=str(user.id),
        user_type=user.user_type,
    )


@router.post("/register-business", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def register_business(
    data: BusinessRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await enforce_rate_limits(
        RateLimitCheck(
            policy=ACCOUNT_REGISTRATION_IP_LIMIT,
            key_parts=(get_client_ip(request),),
        ),
    )

    user, business = await register_business_owner(
        db,
        email=data.email,
        password=data.password,
        name=data.name,
        phone=data.phone,
        business_name=data.business_name,
        business_slug=data.business_slug,
        business_address=data.business_address,
        business_description=data.business_description,
    )

    token = create_access_token(
        str(user.id), user.user_type, user.session_version
    )
    return LoginResponse(
        access_token=token,
        user_id=str(user.id),
        user_type=user.user_type,
    )


@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    response = {
        "id": str(current_user.id),
        "email": current_user.email,
        "name": current_user.name,
        "phone": current_user.phone,
        "avatar": current_user.avatar,
        "user_type": current_user.user_type,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }

    if current_user.user_type == "staff":
        staff_list = await staff_service.get_staff_by_user_id(db, current_user.id)
        if staff_list:
            staff = staff_list[0]
            response["business_id"] = str(staff.business_id)
            response["role"] = staff.role

    return response


@router.get("/me/context")
async def get_me_context(
    current_user: User = Depends(get_current_user),
    current_business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns full session context for staff users: user, business, role,
    derived permissions, enabled modules, and locations.

    Only available to staff users — customers receive 403 (no staff assignment).
    """
    staff_list = await staff_service.get_staff_by_user_id(db, current_user.id)
    staff = staff_list[0] if staff_list else None
    role = staff.role if staff else "staff"

    # Derive permissions from role
    _all_permissions = [
        "can_manage_reservations",
        "can_manage_staff",
        "can_manage_service_types",
        "can_manage_business_profile",
        "can_view_analytics",
        "can_manage_modules",
        "can_delete_business",
        "can_change_billing",
    ]
    _manager_permissions = [p for p in _all_permissions if p not in ("can_delete_business", "can_change_billing")]
    _staff_permissions = ["can_view_reservations", "can_manage_own_schedule"]

    if role == "owner":
        permissions = _all_permissions
    elif role == "manager":
        permissions = _manager_permissions
    else:
        permissions = _staff_permissions

    locations = [
        {"id": str(loc.id), "name": loc.name, "address": loc.address, "is_primary": loc.is_primary}
        for loc in (current_business.locations or [])
    ]

    return {
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "name": current_user.name,
            "phone": current_user.phone,
            "avatar": current_user.avatar,
            "user_type": current_user.user_type,
        },
        "business": {
            "id": str(current_business.id),
            "name": current_business.name,
            "slug": current_business.slug,
            "enabled_modules": current_business.enabled_modules or [],
            "onboarding_complete": current_business.onboarding_complete,
            "notification_channels": current_business.notification_channels or ["email"],
            "locations": locations,
        },
        "role": role,
        "permissions": permissions,
        "enabled_modules": current_business.enabled_modules or [],
    }


@router.patch("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's profile (name, phone, avatar)."""
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(current_user, key, value)
    await db.flush()
    return current_user


@router.post("/change-email")
async def change_email(
    data: ChangeEmailRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the current user's email (requires password confirmation)."""
    if not verify_password(data.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password",
        )
    current_user.email = data.new_email
    current_user.session_version += 1
    await db.flush()
    return {"message": "Email updated successfully"}


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the current user's password."""
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password",
        )
    current_user.password_hash = hash_password(data.new_password)
    current_user.session_version += 1
    await db.flush()
    return {"message": "Password updated successfully"}


@router.post("/disable-account")
async def disable_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable the current user's account."""
    current_user.is_active = False
    current_user.session_version += 1
    await db.flush()
    return {"message": "Account disabled successfully"}


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    data: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    normalized_email = str(data.email).strip().casefold()
    client_ip = get_client_ip(request)
    await enforce_rate_limits(
        RateLimitCheck(
            policy=PASSWORD_RESET_IP_LIMIT,
            key_parts=(client_ip,),
        ),
        RateLimitCheck(
            policy=PASSWORD_RESET_IDENTITY_LIMIT,
            key_parts=(normalized_email,),
        ),
    )

    user = await db.scalar(
        select(User).where(
            User.email == normalized_email,
            User.user_type == "staff",
            User.is_active.is_(True),
        )
    )
    if user is not None:
        _, raw_token = await create_password_reset(db, user)
        await db.commit()
        send_password_reset(
            to_email=user.email,
            reset_url=f"{settings.frontend_url}/auth/reset-password?token={raw_token}",
        )

    return {
        "message": "If an active staff account exists, a reset link has been sent."
    }


@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await enforce_rate_limits(
        RateLimitCheck(
            policy=PASSWORD_RESET_IP_LIMIT,
            key_parts=(get_client_ip(request),),
        ),
    )
    user = await consume_password_reset(db, data.token, data.new_password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link is invalid or has expired",
        )
    await db.commit()
    return {"message": "Password updated successfully"}
