from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.errors import forbidden, not_found
from app.dependencies import (
    get_current_business,
    get_optional_user,
    require_capability,
    require_module,
)
from app.core.rate_limit import enforce_public_read_limit
from app.core.public_access import has_required_privacy_contact
from app.models.business import Business
from app.models.user import User
from app.schemas.service_type import (
    PublicServiceTypeResponse,
    ServiceTypeCreate,
    ServiceTypeResponse,
    ServiceTypeUpdate,
)
from app.services import service_type_service

router = APIRouter(prefix="/api/service-types", tags=["service-types"])


@router.get(
    "/business/{business_id}",
    response_model=list[ServiceTypeResponse | PublicServiceTypeResponse],
    dependencies=[Depends(enforce_public_read_limit)],
)
async def list_service_types(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    business = await db.get(Business, business_id)
    is_own_staff = bool(
        current_user
        and any(
            assignment.business_id == business_id
            for assignment in current_user.staff_assignments
        )
    )
    if business is None or (
        not is_own_staff and not has_required_privacy_contact(business)
    ):
        raise not_found("Business")
    service_types = await service_type_service.get_service_types_by_business(
        db, business_id
    )
    if is_own_staff:
        return service_types
    return [PublicServiceTypeResponse.model_validate(item) for item in service_types]


@router.get(
    "/{service_type_id}",
    response_model=ServiceTypeResponse | PublicServiceTypeResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_service_type(
    service_type_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    service_type = await service_type_service.get_service_type_by_id(db, service_type_id)
    if service_type is None:
        raise HTTPException(status_code=404, detail="Service type not found")
    is_own_staff = bool(
        current_user
        and any(
            assignment.business_id == service_type.business_id
            for assignment in current_user.staff_assignments
        )
    )
    if is_own_staff:
        return service_type
    business = await db.get(Business, service_type.business_id)
    if business is None or not has_required_privacy_contact(business):
        raise not_found("Service type")
    return PublicServiceTypeResponse.model_validate(service_type)


@router.post("", response_model=ServiceTypeResponse, status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability("reservations.configure"))],
)
async def create_service_type(
    data: ServiceTypeCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    __: None = Depends(require_module("reservations")),
):
    if data.business_id != business.id:
        raise forbidden("Not authorized for this business")
    try:
        return await service_type_service.create_service_type(
            db,
            business_id=business.id,
            data=data,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/{service_type_id}", response_model=ServiceTypeResponse,
    dependencies=[Depends(require_capability("reservations.configure"))],
)
async def update_service_type(
    service_type_id: UUID,
    data: ServiceTypeUpdate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    __: None = Depends(require_module("reservations")),
):
    try:
        service_type = await service_type_service.update_service_type(
            db,
            business_id=business.id,
            service_type_id=service_type_id,
            data=data,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if service_type is None:
        raise not_found("Service type")
    return service_type


@router.delete("/{service_type_id}", status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_capability("reservations.configure"))],
)
async def delete_service_type(
    service_type_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    __: None = Depends(require_module("reservations")),
):
    deleted = await service_type_service.delete_service_type(
        db,
        business_id=business.id,
        service_type_id=service_type_id,
    )
    if not deleted:
        raise not_found("Service type")
