from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.menu import ItemLibrary, MenuItem
from app.models.preparation_station import PreparationStation


class PreparationStationError(ValueError):
    def __init__(self, message: str, *, status_code: int = 409):
        self.status_code = status_code
        super().__init__(message)


async def list_stations(
    db: AsyncSession, business_id: UUID, *, include_archived: bool = False
) -> list[PreparationStation]:
    query = select(PreparationStation).where(
        PreparationStation.business_id == business_id
    )
    if not include_archived:
        query = query.where(PreparationStation.is_active.is_(True))
    rows = await db.scalars(
        query.order_by(PreparationStation.sort_order, PreparationStation.name)
    )
    return list(rows.all())


async def get_active_station(
    db: AsyncSession, business_id: UUID, station_id: UUID
) -> PreparationStation:
    station = await db.scalar(
        select(PreparationStation).where(
            PreparationStation.id == station_id,
            PreparationStation.business_id == business_id,
            PreparationStation.is_active.is_(True),
        )
    )
    if station is None:
        raise PreparationStationError("Preparation station not found", status_code=404)
    return station


async def create_station(
    db: AsyncSession, business_id: UUID, *, name: str, sort_order: int
) -> PreparationStation:
    duplicate = await db.scalar(
        select(PreparationStation.id).where(
            PreparationStation.business_id == business_id,
            func.lower(PreparationStation.name) == name.strip().lower(),
        )
    )
    if duplicate:
        raise PreparationStationError("A station with this name already exists")
    station = PreparationStation(
        business_id=business_id, name=name.strip(), sort_order=sort_order
    )
    db.add(station)
    await db.flush()
    return station


async def update_station(
    db: AsyncSession,
    business_id: UUID,
    station_id: UUID,
    *,
    changes: dict,
) -> PreparationStation:
    station = await db.scalar(
        select(PreparationStation)
        .where(
            PreparationStation.id == station_id,
            PreparationStation.business_id == business_id,
            PreparationStation.is_active.is_(True),
        )
        .with_for_update()
    )
    if station is None:
        raise PreparationStationError("Preparation station not found", status_code=404)
    if "name" in changes:
        duplicate = await db.scalar(
            select(PreparationStation.id).where(
                PreparationStation.business_id == business_id,
                PreparationStation.id != station_id,
                func.lower(PreparationStation.name) == changes["name"].strip().lower(),
            )
        )
        if duplicate:
            raise PreparationStationError("A station with this name already exists")
        station.name = changes["name"].strip()
    if "sort_order" in changes:
        station.sort_order = changes["sort_order"]
    await db.flush()
    return station


async def archive_station(
    db: AsyncSession,
    business_id: UUID,
    station_id: UUID,
    *,
    actor_id: UUID,
) -> PreparationStation:
    station = await db.scalar(
        select(PreparationStation)
        .where(
            PreparationStation.id == station_id,
            PreparationStation.business_id == business_id,
            PreparationStation.is_active.is_(True),
        )
        .with_for_update()
    )
    if station is None:
        raise PreparationStationError("Preparation station not found", status_code=404)
    in_use = await db.scalar(
        select(MenuItem.id).where(
            MenuItem.business_id == business_id,
            MenuItem.preparation_station_id == station_id,
        ).limit(1)
    )
    if in_use is None:
        in_use = await db.scalar(
            select(ItemLibrary.id).where(
                ItemLibrary.business_id == business_id,
                ItemLibrary.preparation_station_id == station_id,
            ).limit(1)
        )
    if in_use is not None:
        raise PreparationStationError(
            "Reassign menu and library items before archiving this station"
        )
    station.is_active = False
    station.archived_at = datetime.now(timezone.utc)
    station.archived_by = actor_id
    await db.flush()
    return station
