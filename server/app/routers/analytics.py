from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import forbidden
from app.database import get_db
from app.dependencies import get_current_business, get_current_user
from app.models.business import Business
from app.models.user import User
from app.services import analytics_service

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/business/{business_id}")
async def get_business_stats(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    """Get dashboard stats for the authenticated user's business."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    return await analytics_service.get_business_dashboard_stats(db, business_id)


@router.get("/customer/me")
async def get_my_customer_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await analytics_service.get_customer_dashboard_stats(db, current_user.id)


@router.get("/customer/{customer_id}")
async def get_customer_stats(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get stats for a customer. Only accessible by the customer themselves."""
    if current_user.id != customer_id:
        raise forbidden("Not authorized to view this customer's stats")
    return await analytics_service.get_customer_dashboard_stats(db, customer_id)
