from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode, forbidden, not_found
from app.core.rate_limit import enforce_public_read_limit
from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_roles
from app.models.business import Business
from app.models.user import User
from app.schemas.business import BusinessCreate, BusinessResponse, BusinessUpdate
from app.services import business_service
from app.services import staff_service

router = APIRouter(prefix="/api/businesses", tags=["businesses"])


@router.get(
    "",
    response_model=list[BusinessResponse],
    dependencies=[Depends(enforce_public_read_limit)],
)
async def list_businesses(db: AsyncSession = Depends(get_db)):
    return await business_service.get_businesses(db)


@router.get(
    "/{business_id}",
    response_model=BusinessResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_business(business_id: UUID, db: AsyncSession = Depends(get_db)):
    business = await business_service.get_business_by_id(db, business_id)
    if business is None:
        raise not_found("Business")
    return business


@router.get(
    "/slug/{slug}",
    response_model=BusinessResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_business_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    business = await business_service.get_business_by_slug(db, slug)
    if business is None:
        raise not_found("Business")
    return business


@router.post("", response_model=BusinessResponse, status_code=status.HTTP_201_CREATED)
async def create_business(
    data: BusinessCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await business_service.create_business(db, data)


@router.patch("/{business_id}", response_model=BusinessResponse)
async def update_business(
    business_id: UUID,
    data: BusinessUpdate,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    """Update own business. Requires owner or manager role."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    business = await business_service.update_business(db, business_id, data)
    if business is None:
        raise not_found("Business")
    return business


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

