import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
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
    StaffInviteRequest,
    StaffInviteResponse,
    StaffResponse,
    StaffUpdate,
    StaffWithUserResponse,
)
from app.services import staff_service
from app.services.auth_service import (
    create_access_token,
    hash_opaque_token,
    hash_password,
)
from app.services.email_service import send_staff_invitation

router = APIRouter(prefix="/api/staff", tags=["staff"])


def _invitation_response(invitation: StaffInvitation) -> StaffInviteResponse:
    return StaffInviteResponse(
        id=invitation.id,
        email=invitation.email,
        role=invitation.role,
        expires_at=invitation.expires_at,
        accepted_at=invitation.accepted_at,
        revoked_at=invitation.revoked_at,
        sent_at=invitation.sent_at,
        delivery_status=invitation.delivery_status,
        delivery_error=invitation.delivery_error,
    )


async def _actor_assignment(
    db: AsyncSession, user: User, business: Business
) -> Staff:
    assignment = await staff_service.get_assignment(db, user.id, business.id)
    if assignment is None:
        raise forbidden("Not authorized for this business")
    return assignment


def _assert_role_authority(
    actor: Staff, target_role: str | None, new_role: str | None = None
) -> None:
    try:
        staff_service.assert_can_manage_role(actor.role, target_role, new_role)
    except staff_service.StaffAuthorityError as exc:
        raise forbidden(str(exc)) from exc


async def _deliver_invitation(
    db: AsyncSession,
    invitation: StaffInvitation,
    business: Business,
    raw_token: str,
) -> None:
    delivered = send_staff_invitation(
        to_email=invitation.email,
        business_name=business.name,
        role=invitation.role,
        invite_url=f"{settings.frontend_url}/invite/{raw_token}",
    )
    now = datetime.now(timezone.utc)
    invitation.sent_at = now if delivered else None
    invitation.delivery_status = "sent" if delivered else "failed"
    invitation.delivery_error = (
        None if delivered else "Invitation email provider is unavailable"
    )
    await db.commit()


@router.get("/business/{business_id}", response_model=list[StaffWithUserResponse])
async def list_business_staff(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    staff_list = await staff_service.get_staff_by_business(db, business_id)
    return [
        StaffWithUserResponse(
            id=member.id,
            user_id=member.user_id,
            business_id=member.business_id,
            role=member.role,
            created_at=member.created_at,
            user_name=member.user.name,
            user_email=member.user.email,
            user_phone=member.user.phone,
        )
        for member in staff_list
    ]


@router.get("/invitations", response_model=list[StaffInviteResponse])
async def list_invitations(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("owner", "manager")),
    current_business: Business = Depends(get_current_business),
):
    invitations = await staff_service.list_invitations(db, current_business.id)
    return [_invitation_response(invitation) for invitation in invitations]


@router.get("/{staff_id}", response_model=StaffResponse)
async def get_staff(
    staff_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    member = await staff_service.get_staff_by_id_for_business(
        db, staff_id, current_business.id
    )
    if member is None:
        raise not_found("Staff")
    return member


@router.patch("/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: UUID,
    data: StaffUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("owner", "manager")),
    current_business: Business = Depends(get_current_business),
):
    actor = await _actor_assignment(db, current_user, current_business)
    member = await staff_service.get_staff_by_id_for_business(
        db, staff_id, current_business.id, for_update=True
    )
    if member is None:
        raise not_found("Staff")
    if member.user_id == current_user.id:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "STAFF_SELF_CHANGE",
            "You cannot change your own role",
        )
    _assert_role_authority(actor, member.role, data.role)
    if member.role == "owner" and data.role != "owner":
        if await staff_service.owner_count_for_update(db, current_business.id) <= 1:
            raise api_error(
                status.HTTP_409_CONFLICT,
                "LAST_OWNER",
                "The business must retain at least one owner",
            )
    member.user.session_version += 1
    updated = await staff_service.update_staff(db, member, data)
    await db.commit()
    return updated


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    staff_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("owner", "manager")),
    current_business: Business = Depends(get_current_business),
):
    actor = await _actor_assignment(db, current_user, current_business)
    member = await staff_service.get_staff_by_id_for_business(
        db, staff_id, current_business.id, for_update=True
    )
    if member is None:
        raise not_found("Staff")
    if member.user_id == current_user.id:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "STAFF_SELF_REMOVAL",
            "You cannot remove your own staff access",
        )
    _assert_role_authority(actor, member.role)
    if member.role == "owner":
        if await staff_service.owner_count_for_update(db, current_business.id) <= 1:
            raise api_error(
                status.HTTP_409_CONFLICT,
                "LAST_OWNER",
                "The business must retain at least one owner",
            )
    await staff_service.delete_staff(db, member)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/invite",
    response_model=StaffInviteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_invite(
    data: StaffInviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("owner", "manager")),
    current_business: Business = Depends(get_current_business),
):
    actor = await _actor_assignment(db, current_user, current_business)
    _assert_role_authority(actor, None, data.role)
    email = str(data.email).strip().casefold()
    if await db.scalar(select(User.id).where(User.email == email)) is not None:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "EMAIL_EXISTS",
            "An account with this email already exists",
        )
    existing = await db.scalar(
        select(StaffInvitation.id).where(
            StaffInvitation.business_id == current_business.id,
            StaffInvitation.email == email,
            StaffInvitation.accepted_at.is_(None),
            StaffInvitation.revoked_at.is_(None),
        )
    )
    if existing is not None:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "INVITATION_PENDING",
            "A pending invitation already exists for this email",
        )

    raw_token = secrets.token_urlsafe(32)
    invitation = StaffInvitation(
        business_id=current_business.id,
        email=email,
        role=data.role,
        token_hash=hash_opaque_token(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        invited_by=current_user.id,
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    await _deliver_invitation(db, invitation, current_business, raw_token)
    return _invitation_response(invitation)


@router.post(
    "/invitations/{invitation_id}/revoke",
    response_model=StaffInviteResponse,
)
async def revoke_invitation(
    invitation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("owner", "manager")),
    current_business: Business = Depends(get_current_business),
):
    actor = await _actor_assignment(db, current_user, current_business)
    invitation = await staff_service.get_invitation_for_business(
        db, invitation_id, current_business.id, for_update=True
    )
    if invitation is None:
        raise not_found("Invitation")
    _assert_role_authority(actor, invitation.role)
    if invitation.accepted_at is not None:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "INVITATION_USED",
            "An accepted invitation cannot be revoked",
        )
    invitation.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return _invitation_response(invitation)


@router.post(
    "/invitations/{invitation_id}/resend",
    response_model=StaffInviteResponse,
)
async def resend_invitation(
    invitation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("owner", "manager")),
    current_business: Business = Depends(get_current_business),
):
    actor = await _actor_assignment(db, current_user, current_business)
    invitation = await staff_service.get_invitation_for_business(
        db, invitation_id, current_business.id, for_update=True
    )
    if invitation is None:
        raise not_found("Invitation")
    _assert_role_authority(actor, invitation.role)
    if invitation.accepted_at is not None or invitation.revoked_at is not None:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "INVITATION_INACTIVE",
            "Only a pending invitation can be resent",
        )
    raw_token = secrets.token_urlsafe(32)
    invitation.token_hash = hash_opaque_token(raw_token)
    invitation.expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    invitation.delivery_status = "pending"
    invitation.delivery_error = None
    invitation.sent_at = None
    await db.commit()
    await _deliver_invitation(db, invitation, current_business, raw_token)
    return _invitation_response(invitation)


async def _public_invitation(
    db: AsyncSession, raw_token: str, *, for_update: bool = False
) -> StaffInvitation | None:
    statement = select(StaffInvitation).where(
        StaffInvitation.token_hash == hash_opaque_token(raw_token)
    )
    if for_update:
        statement = statement.with_for_update()
    return await db.scalar(statement)


def _assert_invitation_active(invitation: StaffInvitation) -> None:
    if invitation.accepted_at is not None:
        raise api_error(
            status.HTTP_410_GONE,
            "INVITATION_USED",
            "This invitation has already been accepted",
        )
    if invitation.revoked_at is not None:
        raise api_error(
            status.HTTP_410_GONE,
            "INVITATION_REVOKED",
            "This invitation has been revoked",
        )
    if invitation.expires_at <= datetime.now(timezone.utc):
        raise api_error(
            status.HTTP_410_GONE,
            "INVITATION_EXPIRED",
            "This invitation has expired",
        )


@router.get(
    "/invite/{token}",
    response_model=InviteDetailsResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_invite(token: str, db: AsyncSession = Depends(get_db)):
    invitation = await _public_invitation(db, token)
    if invitation is None:
        raise not_found("Invitation")
    _assert_invitation_active(invitation)
    business = await db.scalar(
        select(Business).where(Business.id == invitation.business_id)
    )
    return InviteDetailsResponse(
        email=invitation.email,
        role=invitation.role,
        business_name=business.name if business else "",
    )


@router.post(
    "/invite/{token}/accept",
    response_model=LoginResponse,
    status_code=status.HTTP_201_CREATED,
)
async def accept_invite(
    token: str,
    data: AcceptInviteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await enforce_rate_limits(
        RateLimitCheck(
            policy=INVITE_ACCEPT_IP_LIMIT,
            key_parts=(get_client_ip(request),),
        ),
    )
    invitation = await _public_invitation(db, token, for_update=True)
    if invitation is None:
        raise not_found("Invitation")
    _assert_invitation_active(invitation)
    if await db.scalar(select(User.id).where(User.email == invitation.email)):
        raise api_error(
            status.HTTP_409_CONFLICT,
            "EMAIL_EXISTS",
            "An account with this email already exists. Please log in.",
        )

    new_user = User(
        email=invitation.email,
        name=data.name,
        password_hash=hash_password(data.password),
        user_type="staff",
    )
    db.add(new_user)
    await db.flush()
    db.add(
        Staff(
            user_id=new_user.id,
            business_id=invitation.business_id,
            role=invitation.role,
        )
    )
    invitation.accepted_at = datetime.now(timezone.utc)
    await db.commit()

    access_token = create_access_token(
        str(new_user.id), "staff", new_user.session_version
    )
    return LoginResponse(
        access_token=access_token,
        user_id=str(new_user.id),
        user_type="staff",
    )
