from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import api_error
from app.core.rate_limit import enforce_public_read_limit
from app.database import get_db
from app.schemas.booking_schedule import AvailabilityResponse
from app.services import availability_service
from app.services.availability_service import AvailabilityError


router = APIRouter(prefix="/api/availability", tags=["availability"])


@router.get(
    "/business/{business_id}",
    response_model=AvailabilityResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_business_availability(
    business_id: UUID,
    service_type_id: UUID = Query(...),
    start_date: date = Query(...),
    days: int = Query(default=7, ge=1, le=31),
    guests: int = Query(default=1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await availability_service.get_availability(
            db,
            business_id=business_id,
            service_type_id=service_type_id,
            start_date=start_date,
            days=days,
            guests=guests,
        )
    except AvailabilityError as exc:
        raise api_error(
            exc.status_code,
            exc.code,
            exc.message,
            exc.details,
        ) from exc
