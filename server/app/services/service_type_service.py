from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service_type import ServiceType
from app.schemas.service_type import ServiceTypeCreate, ServiceTypeUpdate


async def get_service_types_by_business(
    db: AsyncSession, business_id: UUID
) -> list[ServiceType]:
    result = await db.execute(
        select(ServiceType)
        .where(ServiceType.business_id == business_id)
        .order_by(ServiceType.display_order, ServiceType.name)
    )
    return list(result.scalars().all())


async def get_service_type_by_id(
    db: AsyncSession, service_type_id: UUID
) -> ServiceType | None:
    result = await db.execute(
        select(ServiceType).where(ServiceType.id == service_type_id)
    )
    return result.scalar_one_or_none()


async def create_service_type(
    db: AsyncSession,
    *,
    business_id: UUID,
    data: ServiceTypeCreate,
) -> ServiceType:
    service_type = ServiceType(
        business_id=business_id,
        name=data.name,
        description=data.description,
        capacity=data.capacity,
        max_concurrent_bookings=data.max_concurrent_bookings,
        is_pending_enabled=data.is_pending_enabled,
        duration=data.duration,
        color=data.color,
        display_order=data.display_order,
        image=data.image,
    )
    db.add(service_type)
    await db.flush()
    return service_type


async def update_service_type(
    db: AsyncSession,
    *,
    business_id: UUID,
    service_type_id: UUID,
    data: ServiceTypeUpdate,
) -> ServiceType | None:
    service_type = await db.scalar(
        select(ServiceType).where(
            ServiceType.id == service_type_id,
            ServiceType.business_id == business_id,
        )
    )
    if service_type is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(service_type, key, value)

    await db.flush()
    await db.refresh(service_type)
    return service_type


async def delete_service_type(
    db: AsyncSession,
    *,
    business_id: UUID,
    service_type_id: UUID,
) -> bool:
    service_type = await db.scalar(
        select(ServiceType).where(
            ServiceType.id == service_type_id,
            ServiceType.business_id == business_id,
        )
    )
    if service_type is None:
        return False
    await db.delete(service_type)
    await db.flush()
    return True
