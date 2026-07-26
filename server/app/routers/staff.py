import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.errors import api_error, forbidden, not_found
from app.core.rate_limit import (
    INVITE_ACCEPT_IP_LIMIT,
    RateLimitCheck,
    enforce_public_read_limit,
    enforce_rate_limits,
    get_client_ip,
)
from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_roles
from app.models.business import Business
from app.models.staff import Staff
from app.models.staff_invitation import StaffInvitation
from app.models.user import User
from app.schemas.auth import LoginResponse
from app.schemas.staff import (
    AcceptInviteRequest,
    InviteDetailsResponse,
    StaffCreate,
    StaffInviteRequest,
    StaffInviteResponse,
    StaffResponse,
    StaffUpdate,
    StaffWithUserResponse,
)
from app.services import staff_service
from app.services.auth_service import create_access_token, hash_password
from app.services.email_service import send_staff_invitation

router = APIRouter(prefix="/api/staff", tags=["staff"])


@router.get("/business/{business_id}", response_model=list[StaffWithUserResponse])
async def list_business_staff(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    """List staff for the authenticated user's business."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    staff_list = await staff_service.get_staff_by_business(db, business_id)
    return [
        StaffWithUserResponse(
            id=s.id,
            user_id=s.user_id,
            business_id=s.business_id,
            role=s.role,
            created_at=s.created_at,
            user_name=s.user.name,
            user_email=s.user.email,
            user_phone=s.user.phone,
        )
        for s in staff_list
    ]


@router.get("/{staff_id}", response_model=StaffResponse)
async def get_staff(
    staff_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    staff = await staff_service.get_staff_by_id(db, staff_id)
    if staff is None:
        raise not_found("Staff")
    if staff.business_id != current_business.id:
        raise forbidden("Not authorized for this business")
    return staff


@router.post("", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
async def create_staff(
    data: StaffCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("owner", "manager")),
    current_business: Business = Depends(get_current_business),
):
    """Add a staff member. Requires owner or manager role."""
    return await staff_service.create_staff(db, data)


@router.patch("/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: UUID,
    data: StaffUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("owner", "manager")),
    current_business: Business = Depends(get_current_business),
):
    """Update a staff member's role. Requires owner or manager role."""
    existing = await staff_service.get_staff_by_id(db, staff_id)
    if existing is None:
        raise not_found("Staff")
    if existing.business_id != current_business.id:
        raise forbidden("Not authorized for this business")
    staff = await staff_service.update_staff(db, staff_id, data)
    if staff is None:
        raise not_found("Staff")
    return staff


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    staff_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("owner", "manager")),
    current_business: Business = Depends(get_current_business),
):
    """Remove a staff member. Requires owner or manager role."""
    existing = await staff_service.get_staff_by_id(db, staff_id)
    if existing is None:
        raise not_found("Staff")
    if existing.business_id != current_business.id:
        raise forbidden("Not authorized for this business")
    deleted = await staff_service.delete_staff(db, staff_id)
    if not deleted:
        raise not_found("Staff")


# ─── Staff Invitations ───────────────────────────────────────────────────────

@router.post("/invite", response_model=StaffInviteResponse, status_code=status.HTTP_201_CREATED)
async def send_invite(
    data: StaffInviteRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("owner", "manager")),
    current_business: Business = Depends(get_current_business),
):
    """Send a staff invitation email. Requires owner or manager role."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    invitation = StaffInvitation(
        business_id=current_business.id,
        email=str(data.email),
        role=data.role,
        token=token,
        expires_at=expires_at,
    )
    db.add(invitation)
    await db.commit()

    invite_url = f"{settings.frontend_url}/invite/{token}"
    send_staff_invitation(
        to_email=str(data.email),
        business_name=current_business.name,
        role=data.role,
        invite_url=invite_url,
    )

    return StaffInviteResponse(message="Invitation sent")


@router.get(
    "/invite/{token}",
    response_model=InviteDetailsResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_invite(token: str, db: AsyncSession = Depends(get_db)):
    """Get invitation details by token. Public endpoint."""
    result = await db.execute(
        select(StaffInvitation).where(StaffInvitation.token == token)
    )
    invitation = result.scalar_one_or_none()

    if invitation is None:
        raise not_found("Invitation")

    if invitation.accepted_at is not None:
        raise api_error(status.HTTP_410_GONE, "INVITATION_USED", "This invitation has already been accepted")

    now = datetime.now(timezone.utc)
    if invitation.expires_at < now:
        raise api_error(status.HTTP_410_GONE, "INVITATION_EXPIRED", "This invitation has expired")

    # Load business name
    biz_result = await db.execute(
        select(Business).where(Business.id == invitation.business_id)
    )
    business = biz_result.scalar_one_or_none()

    return InviteDetailsResponse(
        email=invitation.email,
        role=invitation.role,
        business_name=business.name if business else "",
    )


@router.post("/invite/{token}/accept", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def accept_invite(
    token: str,
    data: AcceptInviteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Accept an invitation and create a staff account. Public endpoint."""
    await enforce_rate_limits(
        RateLimitCheck(
            policy=INVITE_ACCEPT_IP_LIMIT,
            key_parts=(get_client_ip(request),),
        ),
    )

    result = await db.execute(
        select(StaffInvitation).where(StaffInvitation.token == token)
    )
    invitation = result.scalar_one_or_none()

    if invitation is None:
        raise not_found("Invitation")

    if invitation.accepted_at is not None:
        raise api_error(status.HTTP_410_GONE, "INVITATION_USED", "This invitation has already been accepted")

    now = datetime.now(timezone.utc)
    if invitation.expires_at < now:
        raise api_error(status.HTTP_410_GONE, "INVITATION_EXPIRED", "This invitation has expired")

    # Check if a user with this email already exists
    user_result = await db.execute(select(User).where(User.email == invitation.email))
    existing_user = user_result.scalar_one_or_none()

    if existing_user is not None:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "EMAIL_EXISTS",
            "An account with this email already exists. Please log in.",
        )

    # Create user + staff assignment in one transaction
    new_user = User(
        email=invitation.email,
        name=data.name,
        password_hash=hash_password(data.password),
        user_type="staff",
    )
    db.add(new_user)
    await db.flush()

    staff = Staff(
        user_id=new_user.id,
        business_id=invitation.business_id,
        role=invitation.role,
    )
    db.add(staff)

    invitation.accepted_at = now
    await db.commit()

    access_token = create_access_token(str(new_user.id), "staff")
    return LoginResponse(
        access_token=access_token,
        user_id=str(new_user.id),
        user_type="staff",
    )
