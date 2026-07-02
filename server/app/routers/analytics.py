from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import forbidden
from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_module
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


@router.get(
    "/business/{business_id}/kpis",
    dependencies=[Depends(require_module("insights"))],
)
async def get_business_kpis(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    """Operational KPIs for all enabled modules. Requires insights module."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")

    enabled: list = current_business.enabled_modules or []
    reservation_kpis = await analytics_service.get_reservation_kpis(db, business_id)
    ordering_kpis = (
        await analytics_service.get_ordering_kpis(db, business_id)
        if "ordering" in enabled
        else None
    )
    inventory_kpis = (
        await analytics_service.get_inventory_kpis(db, business_id)
        if "inventory" in enabled
        else None
    )

    return {
        "reservation": reservation_kpis,
        "ordering": ordering_kpis,
        "inventory": inventory_kpis,
    }


@router.get(
    "/business/{business_id}/high-risk",
    dependencies=[Depends(require_module("insights"))],
)
async def get_high_risk_reservations(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    """Upcoming confirmed reservations with high cancellation risk (from ML predictions)."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    return await analytics_service.get_high_risk_reservations(db, business_id)
