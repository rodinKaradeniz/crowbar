from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import enforce_public_read_limit
from app.core.regional import RegionalValidationError, regional_options, suggested_region
from app.database import get_db
from app.dependencies import get_current_business, require_roles
from app.models.business import Business
from app.models.user import User
from app.schemas.tax import (
    RegionalOptionsResponse,
    RegionalSuggestionResponse,
    TaxProfileCreate,
    TaxProfileResponse,
    TaxProfileVersionCreate,
)
from app.services import tax_service

router = APIRouter(prefix="/api", tags=["regional-tax"])


@router.get(
    "/regional/options",
    response_model=RegionalOptionsResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_regional_options(locale: str = Query(default="en")):
    try:
        return regional_options(locale)
    except RegionalValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get(
    "/regional/suggestion/{country_code}",
    response_model=RegionalSuggestionResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_regional_suggestion(country_code: str):
    try:
        return suggested_region(country_code)
    except RegionalValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get("/tax-profiles", response_model=list[TaxProfileResponse])
async def list_tax_profiles(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    profiles = await tax_service.list_profiles(db, business.id)
    return [tax_service.profile_to_dict(profile) for profile in profiles]


@router.post("/tax-profiles", response_model=TaxProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_tax_profile(
    body: TaxProfileCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    actor: User = Depends(require_roles("owner", "manager")),
):
    try:
        profile = await tax_service.create_profile(db, business.id, actor.id, body)
    except tax_service.TaxProfileError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return tax_service.profile_to_dict(profile)


@router.post("/tax-profiles/{profile_id}/versions", response_model=TaxProfileResponse)
async def create_tax_profile_version(
    profile_id: UUID,
    body: TaxProfileVersionCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    actor: User = Depends(require_roles("owner", "manager")),
):
    try:
        profile = await tax_service.add_version(db, business.id, profile_id, actor.id, body)
    except tax_service.TaxProfileError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return tax_service.profile_to_dict(profile)


@router.post("/tax-profiles/{profile_id}/archive", response_model=TaxProfileResponse)
async def archive_tax_profile(
    profile_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    actor: User = Depends(require_roles("owner", "manager")),
):
    try:
        profile = await tax_service.archive_profile(db, business.id, profile_id, actor.id)
    except tax_service.TaxProfileError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return tax_service.profile_to_dict(profile)
