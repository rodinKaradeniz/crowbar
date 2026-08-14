from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import forbidden, not_found
from app.core.rate_limit import enforce_public_read_limit
from app.database import get_db
from app.dependencies import get_current_business, require_roles
from app.models.business import Business
from app.models.user import User
from app.schemas.business import BusinessResponse, BusinessUpdate, PublicBusinessResponse
from app.schemas.tax import RegionalAuditResponse
from app.services import business_service

router = APIRouter(prefix="/api/businesses", tags=["businesses"])


@router.get(
    "",
    response_model=list[PublicBusinessResponse],
    dependencies=[Depends(enforce_public_read_limit)],
)
async def list_businesses(db: AsyncSession = Depends(get_db)):
    return await business_service.get_businesses(db)


@router.get("/current", response_model=BusinessResponse)
async def get_current_business_profile(
    current_business: Business = Depends(get_current_business),
):
    return current_business


@router.get(
    "/{business_id}",
    response_model=PublicBusinessResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_business(business_id: UUID, db: AsyncSession = Depends(get_db)):
    business = await business_service.get_business_by_id(db, business_id)
    if business is None:
        raise not_found("Business")
    return business


@router.get(
    "/slug/{slug}",
    response_model=PublicBusinessResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_business_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    business = await business_service.get_business_by_slug(db, slug)
    if business is None:
        raise not_found("Business")
    return business


@router.patch("/{business_id}", response_model=BusinessResponse)
async def update_business(
    business_id: UUID,
    data: BusinessUpdate,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
    actor: User = Depends(require_roles("owner", "manager")),
):
    """Update own business. Requires owner or manager role."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    try:
        business = await business_service.update_business(
            db, business_id, data, actor_id=actor.id
        )
    except business_service.BusinessConfigurationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if business is None:
        raise not_found("Business")
    return business


@router.get("/{business_id}/regional-audit", response_model=list[RegionalAuditResponse])
async def get_regional_audit(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    return await business_service.list_regional_audits(db, business_id)


@router.delete("/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_business(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner")),
):
    """Delete own business. Requires owner role."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    deleted = await business_service.delete_business(db, business_id)
    if not deleted:
        raise not_found("Business")


@router.patch("/{business_id}/onboarding-complete", response_model=BusinessResponse)
async def complete_onboarding(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner")),
):
    """Mark onboarding as complete for the authenticated business. Owner only."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    current_business.onboarding_complete = True
    await db.flush()
    return current_business
