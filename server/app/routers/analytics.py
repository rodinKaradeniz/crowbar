from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import forbidden
from app.core.permissions import has_capability
from app.database import get_db
from app.dependencies import (
    current_staff_role,
    get_current_business,
    get_current_user,
    require_capability,
    require_module,
)
from app.models.business import Business
from app.models.user import User
from app.services import analytics_service

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get(
    "/business/{business_id}",
    dependencies=[Depends(require_capability("overview.view"))],
)
async def get_business_stats(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    """Dashboard stats for the Overview page.

    Every role lands here, so the route itself only asks for `overview.view`.
    The snapshot's money figure is a different question: a bartender needs to
    know how many tabs are open, not what the venue took today. That figure is
    dropped unless the caller may read reports.
    """
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    stats = await analytics_service.get_business_dashboard_stats(db, business_id)
    # Bar-wide operational snapshot (module-gated, read-only) for the Overview.
    ops = await analytics_service.get_bar_ops_snapshot(
        db, business_id, current_business.enabled_modules or []
    )
    if not has_capability(current_staff_role(current_user), "reports.service"):
        ops.pop("ordered_value_today", None)
    stats["ops"] = ops
    return stats


@router.get(
    "/business/{business_id}/kpis",
    dependencies=[Depends(require_module("insights")), Depends(require_capability("reports.service"))],
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
    dependencies=[Depends(require_module("insights")), Depends(require_capability("insights.view"))],
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
