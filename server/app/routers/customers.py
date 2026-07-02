from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import forbidden, not_found
from app.database import get_db
from app.dependencies import get_current_business
from app.models.business import Business
from app.schemas.customer import CustomerResponse
from app.services import customer_service

router = APIRouter(prefix="/api/customers", tags=["customers"])


class VisitorResponse(BaseModel):
    id: str
    name: str | None
    phone: str | None
    email: str | None
    source: Literal["reservation", "walkin"]
    visit_count: int
    last_visit: datetime | None
    party_size: int | None


@router.get("/business/{business_id}", response_model=list[CustomerResponse])
async def list_business_customers(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    """List Customer rows scoped to the authenticated user's business."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    return await customer_service.get_customers_by_business(db, business_id)


@router.get("/business/{business_id}/visitors", response_model=list[VisitorResponse])
async def list_business_visitors(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    """Unified visitor list: reservation customers + queue walk-ins, deduplicated by phone."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    return await customer_service.get_all_visitors(db, business_id)


@router.get("/business/{business_id}/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    business_id: UUID,
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    """Get a single customer scoped to the authenticated business."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    customer = await customer_service.get_customer_by_id(db, customer_id, business_id)
    if customer is None:
        raise not_found("Customer")
    return customer
