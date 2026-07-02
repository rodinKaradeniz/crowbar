from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_business, get_current_user
from app.models.business import Business
from app.models.user import User
from app.schemas.auth import BusinessRegisterRequest, LoginRequest, LoginResponse, RegisterRequest
from app.schemas.user import ChangeEmailRequest, ChangePasswordRequest, UserResponse, UserUpdate
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    hash_password,
    register_business_owner,
    register_user,
    verify_password,
)
from app.services import staff_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, data.email, data.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(str(user.id), user.user_type)
    return LoginResponse(
        access_token=token,
        user_id=str(user.id),
        user_type=user.user_type,
    )


@router.post("/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    user = await register_user(
        db,
        email=data.email,
        password=data.password,
        name=data.name,
        phone=data.phone,
        user_type=data.user_type,
    )

    token = create_access_token(str(user.id), user.user_type)
    return LoginResponse(
        access_token=token,
        user_id=str(user.id),
        user_type=user.user_type,
    )


@router.post("/register-business", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def register_business(data: BusinessRegisterRequest, db: AsyncSession = Depends(get_db)):
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

    token = create_access_token(str(user.id), user.user_type)
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
    await db.flush()
    return {"message": "Password updated successfully"}


@router.post("/disable-account")
async def disable_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable the current user's account."""
    current_user.user_type = f"disabled_{current_user.user_type}"
    await db.flush()
    return {"message": "Account disabled successfully"}


