from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.notification import NotificationResponse, UnreadCountResponse
from typing import Any
from app.services import notification_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = await notification_service.unread_count_with_linked(db, current_user)
    return UnreadCountResponse(count=count)


@router.get("", response_model=list[NotificationResponse])
@router.get("/", response_model=list[NotificationResponse])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    items = await notification_service.list_for_user_with_linked(
        db, current_user, limit=limit, offset=offset
    )
    return [NotificationResponse(**item) for item in items]


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = await notification_service.mark_read(db, notification_id, current_user.id)
    if n is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return n


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import select as sa_select
    from app.models.user import User as UserModel
    linked = await db.execute(
        sa_select(UserModel.id).where(UserModel.email == current_user.email)
    )
    for uid in [row.id for row in linked.all()]:
        await notification_service.mark_all_read(db, uid)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
