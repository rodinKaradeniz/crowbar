from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import ErrorCode
from app.models.location import Location
from app.models.queue_entry import QueueEntry
from app.models.reservation import Reservation
from app.models.table import Table
from app.models.table_area import TableArea
from app.models.table_assignment import QueueTableAssignment, ReservationTableAssignment
from app.models.table_combination import TableCombination, TableCombinationMember
from app.models.table_seating import TableSeating, TableSeatingTable


class FloorPlanError(Exception):
    def __init__(self, status_code: int, message: str, *, code: str = ErrorCode.CONFLICT):
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(message)


def _not_found(resource: str) -> FloorPlanError:
    return FloorPlanError(404, f"{resource} not found", code=ErrorCode.NOT_FOUND)


def _conflict(message: str) -> FloorPlanError:
    return FloorPlanError(409, message)


async def get_primary_location(db: AsyncSession, business_id: UUID) -> Location:
    result = await db.execute(
        select(Location).where(
            Location.business_id == business_id,
            Location.is_primary.is_(True),
        )
    )
    location = result.scalar_one_or_none()
    if location is None:
        raise _conflict("Business has no primary location")
    return location


async def _get_location(
    db: AsyncSession, business_id: UUID, location_id: UUID | None
) -> Location:
    if location_id is None:
        return await get_primary_location(db, business_id)
    result = await db.execute(
        select(Location).where(
            Location.id == location_id,
            Location.business_id == business_id,
        )
    )
    location = result.scalar_one_or_none()
    if location is None:
        raise _not_found("Location")
    return location


async def list_areas(db: AsyncSession, business_id: UUID) -> list[TableArea]:
    result = await db.execute(
        select(TableArea)
        .where(TableArea.business_id == business_id, TableArea.deleted_at.is_(None))
        .order_by(TableArea.sort_order, TableArea.name)
    )
    return list(result.scalars().all())


async def create_area(db, business_id, *, location_id, name, sort_order):
    location = await _get_location(db, business_id, location_id)
    duplicate = await db.scalar(
        select(TableArea.id).where(
            TableArea.business_id == business_id,
            TableArea.location_id == location.id,
            TableArea.deleted_at.is_(None),
            func.lower(TableArea.name) == name.lower(),
        )
    )
    if duplicate:
        raise _conflict("An area with this name already exists")
    area = TableArea(
        business_id=business_id,
        location_id=location.id,
        name=name,
        sort_order=sort_order,
    )
    db.add(area)
    await db.flush()
    return area


async def _get_area(db, business_id: UUID, area_id: UUID, *, lock=False) -> TableArea:
    query = select(TableArea).where(
        TableArea.id == area_id,
        TableArea.business_id == business_id,
        TableArea.deleted_at.is_(None),
    )
    if lock:
        query = query.with_for_update()
    area = (await db.execute(query)).scalar_one_or_none()
    if area is None:
        raise _not_found("Area")
    return area


async def update_area(db, business_id: UUID, area_id: UUID, changes: dict) -> TableArea:
    area = await _get_area(db, business_id, area_id, lock=True)
    if "name" in changes:
        duplicate = await db.scalar(
            select(TableArea.id).where(
                TableArea.business_id == business_id,
                TableArea.location_id == area.location_id,
                TableArea.id != area.id,
                TableArea.deleted_at.is_(None),
                func.lower(TableArea.name) == changes["name"].lower(),
            )
        )
        if duplicate:
            raise _conflict("An area with this name already exists")
    for field, value in changes.items():
        setattr(area, field, value)
    await db.flush()
    return area


async def archive_area(db, business_id: UUID, area_id: UUID) -> None:
    area = await _get_area(db, business_id, area_id, lock=True)
    has_tables = await db.scalar(
        select(Table.id).where(
            Table.area_id == area.id,
            Table.business_id == business_id,
            Table.deleted_at.is_(None),
        ).limit(1)
    )
    if has_tables:
        raise _conflict("Move or archive this area's tables first")
    area.is_active = False
    area.deleted_at = datetime.now(timezone.utc)
    await db.flush()


async def list_tables(db: AsyncSession, business_id: UUID) -> list[Table]:
    result = await db.execute(
        select(Table)
        .where(Table.business_id == business_id, Table.deleted_at.is_(None))
        .order_by(Table.area_id, Table.sort_order, Table.label)
    )
    return list(result.scalars().all())


async def _get_table(db, business_id: UUID, table_id: UUID, *, lock=False) -> Table:
    query = select(Table).where(
        Table.id == table_id,
        Table.business_id == business_id,
        Table.deleted_at.is_(None),
    )
    if lock:
        query = query.with_for_update()
    table = (await db.execute(query)).scalar_one_or_none()
    if table is None:
        raise _not_found("Table")
    return table


async def _ensure_unique_table_label(
    db, business_id, location_id, area_id, label, *, exclude_id=None
):
    query = select(Table.id).where(
        Table.business_id == business_id,
        Table.location_id == location_id,
        Table.area_id == area_id,
        Table.deleted_at.is_(None),
        func.lower(Table.label) == label.lower(),
    )
    if exclude_id:
        query = query.where(Table.id != exclude_id)
    if await db.scalar(query):
        raise _conflict("A table with this label already exists in the area")


async def create_table(db, business_id: UUID, *, area_id: UUID, **values) -> Table:
    area = await _get_area(db, business_id, area_id)
    if not area.is_active:
        raise _conflict("Tables cannot be added to an inactive area")
    await _ensure_unique_table_label(
        db, business_id, area.location_id, area.id, values["label"]
    )
    table = Table(
        business_id=business_id,
        location_id=area.location_id,
        area_id=area.id,
        **values,
    )
    db.add(table)
    await db.flush()
    return table


async def update_table(db, business_id: UUID, table_id: UUID, changes: dict) -> Table:
    table = await _get_table(db, business_id, table_id, lock=True)
    area = await _get_area(db, business_id, changes.get("area_id", table.area_id))
    if not area.is_active:
        raise _conflict("Tables cannot be moved into an inactive area")
    label = changes.get("label", table.label)
    await _ensure_unique_table_label(
        db, business_id, area.location_id, area.id, label, exclude_id=table.id
    )
    changes["location_id"] = area.location_id
    for field, value in changes.items():
        setattr(table, field, value)
    await db.flush()
    return table


async def archive_table(db, business_id: UUID, table_id: UUID) -> None:
    table = await _get_table(db, business_id, table_id, lock=True)
    await _ensure_tables_unoccupied(db, [table.id])
    active_reservation = await db.scalar(
        select(ReservationTableAssignment.table_id)
        .join(Reservation, Reservation.id == ReservationTableAssignment.reservation_id)
        .where(
            ReservationTableAssignment.table_id == table.id,
            Reservation.status.in_(("pending", "confirmed")),
        )
        .limit(1)
    )
    active_queue = await db.scalar(
        select(QueueTableAssignment.table_id)
        .join(QueueEntry, QueueEntry.id == QueueTableAssignment.queue_entry_id)
        .where(
            QueueTableAssignment.table_id == table.id,
            QueueEntry.status.in_(("waiting", "called")),
        )
        .limit(1)
    )
    active_combination = await db.scalar(
        select(TableCombinationMember.table_id)
        .join(
            TableCombination,
            TableCombination.id == TableCombinationMember.combination_id,
        )
        .where(
            TableCombinationMember.table_id == table.id,
            TableCombination.is_active.is_(True),
        )
        .limit(1)
    )
    if active_reservation or active_queue or active_combination:
        raise _conflict("Remove active assignments and combinations before archiving this table")
    table.is_active = False
    table.deleted_at = datetime.now(timezone.utc)
    await db.flush()


async def set_table_state(
    db, business_id: UUID, table_id: UUID, *, state, reason, until, actor_id
) -> Table:
    table = await _get_table(db, business_id, table_id, lock=True)
    if state == "ready":
        reason = None
        until = None
    table.operational_state = state
    table.operational_state_reason = reason
    table.operational_state_until = until
    table.operational_state_changed_by = actor_id
    table.operational_state_changed_at = datetime.now(timezone.utc)
    await db.flush()
    return table


async def _locked_tables(db, business_id: UUID, table_ids: list[UUID]) -> list[Table]:
    result = await db.execute(
        select(Table)
        .where(
            Table.business_id == business_id,
            Table.id.in_(table_ids),
            Table.deleted_at.is_(None),
            Table.is_active.is_(True),
        )
        .order_by(Table.id)
        .with_for_update()
    )
    tables = list(result.scalars().all())
    if len(tables) != len(table_ids):
        raise _not_found("One or more tables")
    return tables


async def _matching_combination(
    db, business_id: UUID, table_ids: set[UUID]
) -> TableCombination | None:
    result = await db.execute(
        select(TableCombination)
        .where(
            TableCombination.business_id == business_id,
            TableCombination.is_active.is_(True),
        )
        .options(selectinload(TableCombination.members))
    )
    for combination in result.scalars().unique():
        if {member.table_id for member in combination.members} == table_ids:
            return combination
    return None


async def _validate_table_set(db, business_id, table_ids):
    tables = await _locked_tables(db, business_id, table_ids)
    if len({table.location_id for table in tables}) != 1:
        raise _conflict("Assigned tables must be in the same location")
    if len({table.area_id for table in tables}) != 1:
        raise _conflict("Assigned tables must be in the same area")
    combination = None
    if len(tables) > 1:
        combination = await _matching_combination(db, business_id, {t.id for t in tables})
        if combination is None:
            raise _conflict("Multiple tables must match an active configured combination")
    capacity = combination.capacity_override if combination and combination.capacity_override else sum(
        table.capacity for table in tables
    )
    return tables, capacity


def _ensure_tables_operational(tables: list[Table], effective_at: datetime) -> None:
    for table in tables:
        unavailable = (
            table.operational_state == "out_of_service"
            and (
                table.operational_state_until is None
                or table.operational_state_until > effective_at
            )
        )
        if unavailable:
            raise _conflict(f"Table {table.label} is out of service")


def _validate_capacity(party_size, capacity, can_override, reason):
    if party_size <= capacity:
        return None
    if not can_override:
        raise FloorPlanError(
            403,
            "Only owners and managers can override table capacity",
            code=ErrorCode.FORBIDDEN,
        )
    if not reason or len(reason.strip()) < 10:
        raise FloorPlanError(
            422,
            "A capacity override reason of at least 10 characters is required",
            code=ErrorCode.VALIDATION_ERROR,
        )
    return reason.strip()


async def create_combination(
    db, business_id: UUID, *, name, table_ids, capacity_override
) -> TableCombination:
    tables = await _locked_tables(db, business_id, table_ids)
    if len({table.location_id for table in tables}) != 1 or len({table.area_id for table in tables}) != 1:
        raise _conflict("Combination tables must be in the same area and location")
    duplicate_name = await db.scalar(
        select(TableCombination.id).where(
            TableCombination.business_id == business_id,
            TableCombination.location_id == tables[0].location_id,
            func.lower(TableCombination.name) == name.lower(),
        )
    )
    if duplicate_name:
        raise _conflict("A combination with this name already exists")
    if await _matching_combination(db, business_id, set(table_ids)):
        raise _conflict("This exact table combination already exists")
    combination = TableCombination(
        business_id=business_id,
        location_id=tables[0].location_id,
        area_id=tables[0].area_id,
        name=name,
        capacity_override=capacity_override,
        members=[TableCombinationMember(table_id=table.id) for table in tables],
    )
    db.add(combination)
    await db.flush()
    return combination


async def list_combinations(db, business_id: UUID) -> list[TableCombination]:
    result = await db.execute(
        select(TableCombination)
        .where(TableCombination.business_id == business_id)
        .options(selectinload(TableCombination.members))
        .order_by(TableCombination.name)
    )
    return list(result.scalars().unique().all())


async def update_combination(
    db, business_id: UUID, combination_id: UUID, changes: dict
) -> TableCombination:
    combination = (
        await db.execute(
            select(TableCombination)
            .where(
                TableCombination.id == combination_id,
                TableCombination.business_id == business_id,
            )
            .options(selectinload(TableCombination.members))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if combination is None:
        raise _not_found("Combination")
    if "name" in changes:
        duplicate = await db.scalar(
            select(TableCombination.id).where(
                TableCombination.business_id == business_id,
                TableCombination.location_id == combination.location_id,
                TableCombination.id != combination.id,
                func.lower(TableCombination.name) == changes["name"].lower(),
            )
        )
        if duplicate:
            raise _conflict("A combination with this name already exists")
        combination.name = changes["name"]
    if "table_ids" in changes:
        tables = await _locked_tables(db, business_id, changes["table_ids"])
        if len({table.location_id for table in tables}) != 1 or len({table.area_id for table in tables}) != 1:
            raise _conflict("Combination tables must be in the same area and location")
        match = await _matching_combination(db, business_id, set(changes["table_ids"]))
        if match and match.id != combination.id:
            raise _conflict("This exact table combination already exists")
        combination.location_id = tables[0].location_id
        combination.area_id = tables[0].area_id
        combination.members = [
            TableCombinationMember(table_id=table.id) for table in tables
        ]
    if "capacity_override" in changes:
        combination.capacity_override = changes["capacity_override"]
    if "is_active" in changes:
        combination.is_active = changes["is_active"]
    await db.flush()
    return combination


async def combination_capacity(db, combination: TableCombination) -> int:
    if combination.capacity_override:
        return combination.capacity_override
    return int(
        await db.scalar(
            select(func.coalesce(func.sum(Table.capacity), 0)).where(
                Table.id.in_([member.table_id for member in combination.members])
            )
        )
    )


async def _ensure_tables_unoccupied(db, table_ids: list[UUID]):
    occupied = await db.scalar(
        select(TableSeatingTable.table_id)
        .join(TableSeating, TableSeating.id == TableSeatingTable.seating_id)
        .where(TableSeatingTable.table_id.in_(table_ids), TableSeating.status == "open")
        .limit(1)
    )
    if occupied:
        raise _conflict("One or more tables are currently occupied")


async def replace_reservation_assignment(
    db, business_id, reservation_id, table_ids, actor_id, can_override, reason
):
    reservation = (
        await db.execute(
            select(Reservation)
            .where(Reservation.id == reservation_id, Reservation.business_id == business_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if reservation is None:
        raise _not_found("Reservation")
    if reservation.status not in {"pending", "confirmed"}:
        raise _conflict("Only active reservations can be assigned tables")
    tables, capacity = await _validate_table_set(db, business_id, table_ids)
    _ensure_tables_operational(tables, reservation.time)
    reason = _validate_capacity(reservation.guests, capacity, can_override, reason)
    conflict = await db.scalar(
        select(ReservationTableAssignment.table_id)
        .join(Reservation, Reservation.id == ReservationTableAssignment.reservation_id)
        .where(
            ReservationTableAssignment.table_id.in_(table_ids),
            Reservation.id != reservation.id,
            Reservation.status.in_(("pending", "confirmed")),
            Reservation.time < reservation.ends_at,
            Reservation.ends_at > reservation.time,
        )
        .limit(1)
    )
    if conflict:
        raise _conflict("One or more tables are assigned to an overlapping reservation")
    await _ensure_tables_unoccupied(db, table_ids)
    await db.execute(
        delete(ReservationTableAssignment).where(
            ReservationTableAssignment.reservation_id == reservation.id
        )
    )
    assigned_at = datetime.now(timezone.utc)
    for table in tables:
        db.add(
            ReservationTableAssignment(
                reservation_id=reservation.id,
                table_id=table.id,
                business_id=business_id,
                location_id=table.location_id,
                assigned_by=actor_id,
                assigned_at=assigned_at,
                capacity_override_reason=reason,
            )
        )
    if reservation.location_id is None:
        reservation.location_id = tables[0].location_id
    elif reservation.location_id != tables[0].location_id:
        raise _conflict("Tables must be in the reservation's location")
    await db.flush()
    return reservation, tables, capacity, assigned_at, reason


async def replace_queue_assignment(
    db, business_id, entry_id, table_ids, actor_id, can_override, reason
):
    entry = (
        await db.execute(
            select(QueueEntry)
            .where(QueueEntry.id == entry_id, QueueEntry.business_id == business_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if entry is None:
        raise _not_found("Queue entry")
    if entry.status not in {"waiting", "called"}:
        raise _conflict("Only waiting or called parties can be assigned tables")
    tables, capacity = await _validate_table_set(db, business_id, table_ids)
    _ensure_tables_operational(tables, datetime.now(timezone.utc))
    reason = _validate_capacity(entry.party_size, capacity, can_override, reason)
    conflict = await db.scalar(
        select(QueueTableAssignment.table_id)
        .join(QueueEntry, QueueEntry.id == QueueTableAssignment.queue_entry_id)
        .where(
            QueueTableAssignment.table_id.in_(table_ids),
            QueueEntry.id != entry.id,
            QueueEntry.status.in_(("waiting", "called")),
        )
        .limit(1)
    )
    if conflict:
        raise _conflict("One or more tables are assigned to another active queue party")
    await _ensure_tables_unoccupied(db, table_ids)
    await db.execute(delete(QueueTableAssignment).where(QueueTableAssignment.queue_entry_id == entry.id))
    assigned_at = datetime.now(timezone.utc)
    for table in tables:
        db.add(
            QueueTableAssignment(
                queue_entry_id=entry.id,
                table_id=table.id,
                business_id=business_id,
                location_id=table.location_id,
                assigned_by=actor_id,
                assigned_at=assigned_at,
                capacity_override_reason=reason,
            )
        )
    if entry.location_id is None:
        entry.location_id = tables[0].location_id
    elif entry.location_id != tables[0].location_id:
        raise _conflict("Tables must be in the queue party's location")
    await db.flush()
    return entry, tables, capacity, assigned_at, reason


async def open_seating(
    db, business_id, source_type, source_id, table_ids, actor_id, can_override, reason
):
    if source_type == "reservation":
        source, tables, _, _, _ = await replace_reservation_assignment(
            db, business_id, source_id, table_ids, actor_id, can_override, reason
        )
        party_size = source.guests
        source.status = "confirmed"
        reservation_id, queue_entry_id = source.id, None
    else:
        source, tables, _, _, _ = await replace_queue_assignment(
            db, business_id, source_id, table_ids, actor_id, can_override, reason
        )
        party_size = source.party_size
        source.status = "seated"
        source.seated_at = datetime.now(timezone.utc)
        reservation_id, queue_entry_id = None, source.id
    for table in tables:
        if table.operational_state != "ready":
            raise _conflict(f"Table {table.label} is not ready")
    await _ensure_tables_unoccupied(db, table_ids)
    seating = TableSeating(
        business_id=business_id,
        location_id=tables[0].location_id,
        reservation_id=reservation_id,
        queue_entry_id=queue_entry_id,
        party_size=party_size,
        status="open",
        opened_by=actor_id,
        tables=[TableSeatingTable(table_id=table.id) for table in tables],
    )
    db.add(seating)
    await db.flush()
    return seating


async def close_seating(db, business_id: UUID, seating_id: UUID, actor_id: UUID):
    seating = (
        await db.execute(
            select(TableSeating)
            .where(TableSeating.id == seating_id, TableSeating.business_id == business_id)
            .options(selectinload(TableSeating.tables))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if seating is None:
        raise _not_found("Seating")
    if seating.status != "open":
        raise _conflict("Seating is already closed")
    now = datetime.now(timezone.utc)
    seating.status = "closed"
    seating.closed_by = actor_id
    seating.closed_at = now
    table_ids = [member.table_id for member in seating.tables]
    tables = await _locked_tables(db, business_id, table_ids)
    for table in tables:
        if table.operational_state != "out_of_service":
            table.operational_state = "cleaning"
            table.operational_state_reason = None
            table.operational_state_until = None
            table.operational_state_changed_by = actor_id
            table.operational_state_changed_at = now
    if seating.reservation_id:
        reservation = await db.get(Reservation, seating.reservation_id)
        reservation.status = "completed"
    else:
        entry = await db.get(QueueEntry, seating.queue_entry_id)
        entry.status = "completed"
        entry.completed_at = now
    await db.flush()
    return seating
