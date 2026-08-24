from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode, api_error
from app.core.rate_limit import (
    PUBLIC_IDENTITY_WRITE_LIMIT,
    PUBLIC_WRITE_IP_LIMIT,
    RateLimitCheck,
    enforce_rate_limits,
    get_client_ip,
)
from app.database import get_db
from app.models.business import Business
from app.models.reservation import Reservation
from app.models.reservation_waitlist import ReservationWaitlistEntry
from app.models.password_reset_token import PasswordResetToken
from app.models.staff_invitation import StaffInvitation
from app.schemas.public_capability import PublicCapabilityExchange
from app.services.public_session_service import set_public_cookie
from app.services.auth_service import hash_opaque_token
from app.services.reservation_guest_token_service import (
    ReservationGuestTokenError,
    parse_guest_token,
)
from app.services.reservation_waitlist_token_service import (
    WaitlistOfferTokenError,
    parse_management_token,
    parse_offer_token,
)


router = APIRouter(prefix="/api/public/capabilities", tags=["public-capabilities"])


def _invalid_capability():
    return api_error(
        status.HTTP_404_NOT_FOUND,
        ErrorCode.NOT_FOUND,
        "This link is no longer valid",
    )


@router.post("/exchange", status_code=status.HTTP_204_NO_CONTENT)
async def exchange_public_capability(
    body: PublicCapabilityExchange,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    await enforce_rate_limits(
        RateLimitCheck(
            policy=PUBLIC_WRITE_IP_LIMIT,
            key_parts=("capability_exchange", body.kind, get_client_ip(request)),
        ),
        RateLimitCheck(
            policy=PUBLIC_IDENTITY_WRITE_LIMIT,
            key_parts=("capability_exchange", body.kind, body.token),
        ),
    )
    try:
        if body.kind == "password_reset":
            resource = await db.scalar(
                select(PasswordResetToken).where(
                    PasswordResetToken.token_hash == hash_opaque_token(body.token),
                    PasswordResetToken.used_at.is_(None),
                    PasswordResetToken.expires_at > datetime.now(timezone.utc),
                )
            )
            if resource is None:
                raise _invalid_capability()
            set_public_cookie(
                response, kind="password_reset", token=body.token, max_age=30 * 60
            )
            response.status_code = status.HTTP_204_NO_CONTENT
            return None
        if body.kind == "staff_invite":
            resource = await db.scalar(
                select(StaffInvitation).where(
                    StaffInvitation.token_hash == hash_opaque_token(body.token),
                    StaffInvitation.accepted_at.is_(None),
                    StaffInvitation.revoked_at.is_(None),
                    StaffInvitation.expires_at > datetime.now(timezone.utc),
                )
            )
            if resource is None:
                raise _invalid_capability()
            set_public_cookie(
                response, kind="staff_invite", token=body.token, max_age=24 * 60 * 60
            )
            response.status_code = status.HTTP_204_NO_CONTENT
            return None
        if body.kind == "reservation":
            business_id, resource_id, revision = parse_guest_token(body.token)
            resource = await db.scalar(
                select(Reservation).where(
                    Reservation.id == resource_id,
                    Reservation.business_id == business_id,
                    Reservation.guest_token_revision == revision,
                    Reservation.status.in_(("pending", "confirmed")),
                )
            )
            cookie_kind = "reservation"
        else:
            parser = parse_offer_token if body.kind == "waitlist_offer" else parse_management_token
            business_id, resource_id, revision = parser(body.token)
            resource = await db.scalar(
                select(ReservationWaitlistEntry).where(
                    ReservationWaitlistEntry.id == resource_id,
                    ReservationWaitlistEntry.business_id == business_id,
                    (
                        ReservationWaitlistEntry.offer_token_revision == revision
                        if body.kind == "waitlist_offer"
                        else ReservationWaitlistEntry.management_token_revision == revision
                    ),
                )
            )
            now = datetime.now(timezone.utc)
            if resource is not None and body.kind == "waitlist_offer":
                if (
                    resource.status != "offered"
                    or resource.offer_expires_at is None
                    or resource.offer_expires_at <= now
                ):
                    resource = None
            elif resource is not None and resource.status in {
                "accepted",
                "cancelled",
                "declined",
                "expired",
                "removed",
            }:
                resource = None
            cookie_kind = body.kind
    except (ReservationGuestTokenError, WaitlistOfferTokenError):
        raise _invalid_capability()

    business = await db.scalar(
        select(Business).where(Business.id == business_id)
    )
    if (
        resource is None
        or business is None
        or "reservations" not in (business.enabled_modules or [])
    ):
        raise _invalid_capability()
    set_public_cookie(response, kind=cookie_kind, token=body.token)
    response.status_code = status.HTTP_204_NO_CONTENT
    return None
