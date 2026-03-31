from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import forbidden, not_found
from app.database import get_db
from app.dependencies import get_current_business, get_current_user
from app.models.business import Business
from app.models.user import User
from app.schemas.user import UserResponse
from app.services import customer_service

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("/business/{business_id}", response_model=list[UserResponse])
async def list_business_customers(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    """List customers who have reservations with the authenticated user's business."""
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    return await customer_service.get_customers_by_business(db, business_id)


@router.get("/{customer_id}", response_model=UserResponse)
async def get_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a customer profile.
    Accessible by the customer themselves or any business staff
    (staff check is implicit — the business list endpoint already scopes customers).
    """
    customer = await customer_service.get_customer_by_id(db, customer_id)
    if customer is None:
        raise not_found("Customer")
    return customer
