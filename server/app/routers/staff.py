from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.staff import StaffCreate, StaffResponse, StaffUpdate, StaffWithUserResponse
from app.services import staff_service

router = APIRouter(prefix="/api/staff", tags=["staff"])


@router.get("/business/{business_id}", response_model=list[StaffWithUserResponse])
async def list_business_staff(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    current_user: User = Depends(get_current_user),
):
    staff = await staff_service.get_staff_by_id(db, staff_id)
    if staff is None:
        raise HTTPException(status_code=404, detail="Staff not found")
    return staff


@router.post("", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
async def create_staff(
    data: StaffCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await staff_service.create_staff(db, data)


@router.patch("/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: UUID,
    data: StaffUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    staff = await staff_service.update_staff(db, staff_id, data)
    if staff is None:
        raise HTTPException(status_code=404, detail="Staff not found")
    return staff


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    staff_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = await staff_service.delete_staff(db, staff_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Staff not found")
