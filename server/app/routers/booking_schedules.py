from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode, api_error, not_found
from app.database import get_db
from app.dependencies import get_current_business, require_module, require_roles
from app.models.business import Business
from app.models.user import User
from app.schemas.booking_schedule import (
    BookingScheduleCollectionResponse,
    BookingScheduleOperatingHoursPreview,
    BookingScheduleReplace,
    BookingScheduleResponse,
)
from app.services import booking_schedule_service


router = APIRouter(
    prefix="/api/booking-schedules",
    tags=["booking-schedules"],
    dependencies=[Depends(require_module("reservations"))],
)


def _configuration_missing():
    return api_error(
        status.HTTP_409_CONFLICT,
        ErrorCode.BOOKING_UNAVAILABLE,
        "The default booking schedule has not been configured",
    )


@router.get("", response_model=BookingScheduleCollectionResponse)
async def list_schedules(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    schedules = await booking_schedule_service.list_booking_schedules(
        db, business.id
    )
    default_schedule = next(
        (schedule for schedule in schedules if schedule.service_type_id is None),
        None,
    )
    if default_schedule is None:
        raise _configuration_missing()
    return BookingScheduleCollectionResponse(
        default_schedule=default_schedule,
        service_overrides=[
            schedule
            for schedule in schedules
            if schedule.service_type_id is not None
        ],
    )


@router.put("/default", response_model=BookingScheduleResponse)
async def replace_default_schedule(
    data: BookingScheduleReplace,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    schedule = await booking_schedule_service.replace_default_schedule(
        db,
        business_id=business.id,
        data=data,
    )
    if schedule is None:
        raise _configuration_missing()
    await db.commit()
    return schedule


@router.get(
    "/default/operating-hours-preview",
    response_model=BookingScheduleOperatingHoursPreview,
)
async def preview_operating_hours_copy(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    preview = await booking_schedule_service.preview_operating_hours_copy(
        db,
        business=business,
    )
    if preview is None:
        raise _configuration_missing()
    return preview


@router.post(
    "/default/copy-operating-hours",
    response_model=BookingScheduleResponse,
)
async def copy_operating_hours_to_default(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    schedule = await booking_schedule_service.copy_operating_hours_to_default(
        db,
        business=business,
    )
    if schedule is None:
        raise _configuration_missing()
    await db.commit()
    return schedule


@router.put(
    "/service-types/{service_type_id}",
    response_model=BookingScheduleResponse,
)
async def replace_service_schedule(
    service_type_id: UUID,
    data: BookingScheduleReplace,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    schedule = await booking_schedule_service.replace_service_schedule(
        db,
        business_id=business.id,
        service_type_id=service_type_id,
        data=data,
    )
    if schedule is None:
        raise not_found("Service type")
    await db.commit()
    return schedule


@router.delete(
    "/service-types/{service_type_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_service_schedule(
    service_type_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    deleted = await booking_schedule_service.delete_service_schedule(
        db,
        business_id=business.id,
        service_type_id=service_type_id,
    )
    if not deleted:
        raise not_found("Service type")
    await db.commit()
