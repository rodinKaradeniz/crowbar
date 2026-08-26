"""Guest-led privacy requests.

Before stage 6 the only data-request route was staff-authenticated: a guest who
wanted their data, or wanted to be forgotten, had to ask someone at the venue to
do it for them. That is the gap this closes.

Identity comes from the reservation-management capability the guest already
holds — the same purpose-scoped, revision-bound signed link the reservation and
waitlist flows use, exchanged once for an HttpOnly cookie. Deliberately **no
second guest-identity mechanism**: the guest proves who they are by holding a
link the venue issued to them, and nothing here accepts a customer id, an email
address, or a phone number from the request.

That constraint is also what stops enumeration. There is no lookup by email, so
there is nothing to probe. Every failure returns the same 404 the capability
exchange uses, so an expired link, a revoked link, a forged signature and a
reservation that never existed are indistinguishable from outside.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, status
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
from app.models.customer import CustomerDataRequest
from app.schemas.public_privacy import (
    PublicPrivacyRequest,
    PublicPrivacyRequestResponse,
    PublicPrivacyStateResponse,
)
from app.services import marketing_consent_service, reservation_service
from app.services.public_session_service import get_public_cookie
from app.services.reservation_guest_token_service import (
    ReservationGuestTokenError,
    parse_guest_token,
)

router = APIRouter(prefix="/api/public/privacy", tags=["public-privacy"])


def _invalid():
    """One answer for every failure, so the surface cannot be probed."""
    return api_error(
        status.HTTP_404_NOT_FOUND,
        ErrorCode.NOT_FOUND,
        "This link is no longer valid",
    )


async def _guest_customer(request: Request, db: AsyncSession):
    """Resolve the guest behind the reservation capability cookie.

    Returns `(business_id, customer_id, business)`. Raises the uniform 404 if
    the cookie is missing, the signature does not verify, the reservation has
    been revoked by a revision bump, or the reservation carries no guest
    identity to act on.
    """
    token = get_public_cookie(request, kind="reservation")
    if token is None:
        raise _invalid()

    try:
        business_id, reservation_id, revision = parse_guest_token(token)
    except ReservationGuestTokenError as exc:
        raise _invalid() from exc

    reservation = await reservation_service.get_reservation_by_id(
        db, reservation_id, business_id=business_id, load_relations=True
    )
    if reservation is None or reservation.guest_token_revision != revision:
        raise _invalid()
    if reservation.customer_id is None:
        raise _invalid()

    return business_id, reservation.customer_id, reservation.business


@router.get("", response_model=PublicPrivacyStateResponse)
async def get_privacy_state(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """What the venue currently holds for this guest's marketing consent.

    A guest cannot act on a setting they cannot see, so the withdrawal surface
    shows the current state first. It deliberately returns consent only — not
    the guest's profile — because a stolen link should not become a way to read
    someone's visit history.
    """
    business_id, customer_id, business = await _guest_customer(request, db)
    state = await marketing_consent_service.consent_state(
        db, business_id=business_id, customer_id=customer_id
    )
    return PublicPrivacyStateResponse(
        marketing_consent=state,
        privacy_contact=business.privacy_contact,
        privacy_policy_url=business.privacy_policy_url,
    )


@router.post(
    "/requests",
    response_model=PublicPrivacyRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_privacy_request(
    body: PublicPrivacyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Raise an access, correction, deletion or consent-withdrawal request.

    Withdrawal takes effect immediately — it is a setting the venue controls, so
    making the guest wait for staff would be theatre. Access, correction and
    deletion are recorded as pending for staff to action, because each needs a
    human to assemble or verify something, and claiming otherwise would be a
    false completion.
    """
    business_id, customer_id, business = await _guest_customer(request, db)

    await enforce_rate_limits(
        RateLimitCheck(
            policy=PUBLIC_WRITE_IP_LIMIT,
            key_parts=("privacy_request", body.request_type, get_client_ip(request)),
        ),
        RateLimitCheck(
            policy=PUBLIC_IDENTITY_WRITE_LIMIT,
            key_parts=("privacy_request", body.request_type, str(customer_id)),
        ),
    )

    now = datetime.now(timezone.utc)
    withdrawn: list[str] = []

    if body.request_type == "withdraw_consent":
        withdrawn = await marketing_consent_service.withdraw_all(
            db, business_id=business_id, customer_id=customer_id
        )
        status_value, completed_at = "completed", now
        detail = (
            f"Guest withdrew marketing consent for: {', '.join(withdrawn)}."
            if withdrawn
            else "Guest requested withdrawal; no marketing consent was on record."
        )
    else:
        status_value, completed_at = "pending", None
        detail = f"Raised by the guest through their reservation link. {body.note or ''}".strip()

    data_request = CustomerDataRequest(
        business_id=business_id,
        customer_id=customer_id,
        request_type=body.request_type,
        status=status_value,
        detail=detail[:2000],
        # requested_by stays null: no staff member raised this.
        completed_at=completed_at,
    )
    db.add(data_request)
    # Commit before returning: the guest is told this is recorded, so it has to
    # be recorded. There is no event to publish here.
    await db.commit()

    return PublicPrivacyRequestResponse(
        request_type=body.request_type,
        status=status_value,
        withdrawn_channels=withdrawn,
        privacy_contact=business.privacy_contact,
        message=(
            "Your marketing consent has been withdrawn."
            if body.request_type == "withdraw_consent"
            else "The venue has been asked to action your request."
        ),
    )
