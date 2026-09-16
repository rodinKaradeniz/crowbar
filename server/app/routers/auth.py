from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.rate_limit import (
    ACCOUNT_REGISTRATION_IP_LIMIT,
    EMAIL_VERIFICATION_IDENTITY_LIMIT,
    EMAIL_VERIFICATION_IP_LIMIT,
    LOGIN_IDENTITY_LIMIT,
    LOGIN_IP_LIMIT,
    PASSWORD_RESET_IDENTITY_LIMIT,
    PASSWORD_RESET_IP_LIMIT,
    RateLimitCheck,
    enforce_rate_limits,
    get_client_ip,
)
from app.core.errors import api_error
from app.core.image_url import validate_image_url
from app.core.permissions import capabilities_for
from app.core.regional import RegionalValidationError
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
    EmailAlreadyTakenError,
    authenticate_user,
    consume_email_verification,
    consume_password_reset,
    create_access_token,
    create_websocket_token,
    create_email_verification,
    create_password_reset,
    hash_password,
    pending_email_for,
    register_business_owner,
    verify_password,
    WEBSOCKET_TOKEN_TTL_SECONDS,
)
from app.services import staff_service
from app.services.email_service import send_email_verification, send_password_reset
from app.services.public_session_service import clear_public_cookie, get_public_cookie

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _issue_verification(
    db: AsyncSession, user: User, *, new_email: str | None = None
) -> None:
    """Mint a verification link and mail it to the address being proved.

    Committed BEFORE the send, matching forgot-password: a provider outage must
    not roll back the token, or the resend route would have nothing to resend.
    The send's own bool is deliberately not surfaced to the caller -- the user
    is told to check their mail either way, and a failure is now logged and
    visible in the server log rather than silently swallowed.
    """
    _, raw_token = await create_email_verification(db, user, new_email=new_email)
    await db.commit()
    send_email_verification(
        to_email=new_email or user.email,
        verify_url=f"{settings.frontend_url}/auth/verify-email#token={raw_token}",
        is_change=new_email is not None,
    )


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

    try:
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
            country_code=data.country_code,
            currency_code=data.currency_code,
            locale=data.locale,
            timezone=data.timezone,
            tax_label=data.tax_label,
        )
    except RegionalValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    # After the account exists, and committed before the send, so a provider
    # outage cannot roll back the registration. The owner is signed in either
    # way: an unverified account is fully usable and only prompted to confirm.
    await _issue_verification(db, user)

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
        # The account settings page needs this to stop offering a deletion the
        # user has already asked for.
        "deletion_requested_at": (
            current_user.deletion_requested_at.isoformat()
            if current_user.deletion_requested_at
            else None
        ),
        # Migration 053. The workspace prompts an unverified owner to confirm,
        # and the account settings page shows a requested change as PENDING
        # rather than as saved.
        "email_verified": current_user.email_verified_at is not None,
        "pending_email": await pending_email_for(db, current_user),
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
    role = staff.role if staff else None

    # The capability list is the server's own matrix, not a second vocabulary
    # invented here. The client mirrors the same map in `lib/permissions.ts` for
    # server-component page gating; this response is what keeps a session that is
    # already open in agreement with the server after a role change.
    capabilities = sorted(capabilities_for(role))

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
            "email_verified": current_user.email_verified_at is not None,
            "pending_email": await pending_email_for(db, current_user),
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
        "capabilities": capabilities,
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
    if "avatar" in update_data:
        # Same rule and same reason as businesses.image: this value is rendered
        # with `next/image`, and an unusable link should be refused where the
        # staff member can fix it. Raised as a plain string detail because
        # `core/errors.http_exception_handler` puts that straight into
        # `message`, which the client's toast reads.
        try:
            update_data["avatar"] = validate_image_url(update_data["avatar"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    for key, value in update_data.items():
        setattr(current_user, key, value)
    await db.flush()
    return current_user


@router.post("/change-email", status_code=status.HTTP_202_ACCEPTED)
async def change_email(
    data: ChangeEmailRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """REQUEST a change of the current user's email. Does not apply it.

    Before migration 053 this wrote current_user.email and bumped
    session_version on the spot, with no proof the account holder could read
    mail at the new address -- and forgot-password would then send a reset link
    there. The address is now only written when the token mailed to it is
    consumed, so the account keeps its current address, and its password
    recovery, until the new one is proved.

    202, not 200: the request was accepted, the change has not happened.
    """
    if not verify_password(data.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password",
        )

    # Normalized to match how forgot-password looks an account up. Without this
    # a user could change to a mixed-case address and then be unable to request
    # a password reset for it.
    new_email = str(data.new_email).strip().casefold()
    if new_email == current_user.email.strip().casefold():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That is already the address on this account",
        )

    # This route now makes Crowbar send mail to a user-supplied address, so it
    # needs the limits it never had.
    await enforce_rate_limits(
        RateLimitCheck(
            policy=EMAIL_VERIFICATION_IP_LIMIT,
            key_parts=(get_client_ip(request),),
        ),
        RateLimitCheck(
            policy=EMAIL_VERIFICATION_IDENTITY_LIMIT,
            key_parts=(new_email,),
        ),
    )

    taken = await db.scalar(
        select(User.id).where(User.email == new_email, User.id != current_user.id)
    )
    if taken is not None:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "EMAIL_EXISTS",
            "An account with this email already exists.",
        )

    await _issue_verification(db, current_user, new_email=new_email)
    return {
        "message": (
            "Check the new address for a confirmation link. Your account keeps "
            "its current address until you confirm."
        ),
        "pending_email": new_email,
    }


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-send the current verification link, for either case.

    Authenticated deliberately. An unverified owner can still sign in -- login
    is not gated -- so there is no need for an unauthenticated send route, and
    an unauthenticated one keyed on an arbitrary address would be an email-
    flooding tool pointed at strangers.

    Re-sends whatever is outstanding: a pending address change if one is live,
    otherwise the account's own unverified address.
    """
    pending = await pending_email_for(db, current_user)
    if pending is None and current_user.email_verified_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This address is already confirmed",
        )

    await enforce_rate_limits(
        RateLimitCheck(
            policy=EMAIL_VERIFICATION_IP_LIMIT,
            key_parts=(get_client_ip(request),),
        ),
        RateLimitCheck(
            policy=EMAIL_VERIFICATION_IDENTITY_LIMIT,
            key_parts=(pending or current_user.email,),
        ),
    )

    await _issue_verification(db, current_user, new_email=pending)
    return {
        "message": "Confirmation link sent.",
        "pending_email": pending,
    }


@router.post("/verify-email")
async def verify_email(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Consume a verification link.

    The raw token is never in the body. It travels in the email link's URL
    FRAGMENT, so it reaches no server log and no Referer header, and is
    exchanged for a short-lived httpOnly cookie by
    /api/public/capabilities/exchange first -- the same shape as reset-password
    and invite/accept.
    """
    await enforce_rate_limits(
        RateLimitCheck(
            policy=EMAIL_VERIFICATION_IP_LIMIT,
            key_parts=(get_client_ip(request),),
        ),
    )
    token = get_public_cookie(request, kind="email_verify")
    try:
        user = (
            await consume_email_verification(db, token)
            if token is not None
            else None
        )
    except EmailAlreadyTakenError:
        await db.rollback()
        raise api_error(
            status.HTTP_409_CONFLICT,
            "EMAIL_EXISTS",
            "Another account has since claimed that address. Your account "
            "still uses its current one.",
        )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This confirmation link is invalid or has expired",
        )
    await db.commit()
    clear_public_cookie(response, kind="email_verify")
    return {"message": "Email address confirmed", "email": user.email}


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


@router.post("/delete-account")
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start the 30-day window after which the current user's account is erased.

    Deliberately does NOT set is_active or bump session_version. The account
    keeps working for the whole window, because signing in is what cancels the
    request (auth_service.authenticate_user) -- ending the session here would
    make a pending request reachable only while signed out.
    """
    stranded = await staff_service.sole_owner_business_ids(db, current_user.id)
    if stranded:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "LAST_OWNER",
            "Transfer ownership to someone else before deleting your account. "
            "The business must retain at least one owner.",
        )
    # Asking twice must not quietly restart the window. The window runs from
    # when the person first asked; only signing in clears it.
    if current_user.deletion_requested_at is None:
        current_user.deletion_requested_at = datetime.now(timezone.utc)
        await db.flush()
    return {"message": "Account deletion requested"}


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
            reset_url=f"{settings.frontend_url}/auth/reset-password#token={raw_token}",
        )

    return {
        "message": "If an active staff account exists, a reset link has been sent."
    }


@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    await enforce_rate_limits(
        RateLimitCheck(
            policy=PASSWORD_RESET_IP_LIMIT,
            key_parts=(get_client_ip(request),),
        ),
    )
    token = get_public_cookie(request, kind="password_reset")
    user = (
        await consume_password_reset(db, token, data.new_password)
        if token is not None
        else None
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link is invalid or has expired",
        )
    await db.commit()
    clear_public_cookie(response, kind="password_reset")
    return {"message": "Password updated successfully"}
