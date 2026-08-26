from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_capability, get_current_business, get_current_user, require_module
from app.models.business import Business
from app.models.user import User
from app.schemas.happy_hour import (
    HappyHourWindowCreate,
    HappyHourWindowResponse,
    HappyHourWindowUpdate,
)
from app.services import happy_hour_service

# Happy hour is a feature of the ordering module, not a module of its own.
router = APIRouter(
    prefix="/api/happy-hour",
    tags=["happy-hour"],
    dependencies=[Depends(require_module("ordering"))],
)


@router.get("/windows", response_model=list[HappyHourWindowResponse],
    dependencies=[Depends(require_capability("menu.view"))],
)
async def list_windows(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    return await happy_hour_service.list_windows(db, business.id)


@router.post(
    "/windows",
    response_model=HappyHourWindowResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability("happyhour.manage"))],
)
async def create_window(
    body: HappyHourWindowCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    window = await happy_hour_service.create_window(db, business.id, body)
    await db.commit()
    return window


@router.patch("/windows/{window_id}", response_model=HappyHourWindowResponse,
    dependencies=[Depends(require_capability("happyhour.manage"))],
)
async def update_window(
    window_id: UUID,
    body: HappyHourWindowUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    window = await happy_hour_service.update_window(db, window_id, business.id, body)
    if window is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Happy hour window not found"
        )
    await db.commit()
    return window


@router.delete("/windows/{window_id}", status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_capability("happyhour.manage"))],
)
async def delete_window(
    window_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    deleted = await happy_hour_service.delete_window(db, window_id, business.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Happy hour window not found"
        )
    await db.commit()
