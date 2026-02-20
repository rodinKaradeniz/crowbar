from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.service_type import (
    ServiceTypeCreate,
    ServiceTypeResponse,
    ServiceTypeUpdate,
)
from app.services import service_type_service

router = APIRouter(prefix="/api/service-types", tags=["service-types"])


@router.get("/business/{business_id}", response_model=list[ServiceTypeResponse])
async def list_service_types(
    business_id: UUID, db: AsyncSession = Depends(get_db)
):
    return await service_type_service.get_service_types_by_business(db, business_id)


@router.get("/{service_type_id}", response_model=ServiceTypeResponse)
async def get_service_type(
    service_type_id: UUID, db: AsyncSession = Depends(get_db)
):
    service_type = await service_type_service.get_service_type_by_id(db, service_type_id)
    if service_type is None:
        raise HTTPException(status_code=404, detail="Service type not found")
    return service_type


@router.post("", response_model=ServiceTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_service_type(
    data: ServiceTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await service_type_service.create_service_type(db, data)


@router.patch("/{service_type_id}", response_model=ServiceTypeResponse)
async def update_service_type(
    service_type_id: UUID,
    data: ServiceTypeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service_type = await service_type_service.update_service_type(
        db, service_type_id, data
    )
    if service_type is None:
        raise HTTPException(status_code=404, detail="Service type not found")
    return service_type


@router.delete("/{service_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service_type(
    service_type_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = await service_type_service.delete_service_type(db, service_type_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Service type not found")
