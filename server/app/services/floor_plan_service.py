from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import ErrorCode
from app.models.business import Business
from app.models.location import Location
from app.models.queue_entry import QueueEntry
from app.models.reservation import Reservation
from app.models.service_type import ServiceType
from app.models.table import Table
from app.models.table_area import TableArea
from app.models.table_assignment import QueueTableAssignment, ReservationTableAssignment
from app.models.table_combination import TableCombination, TableCombinationMember
from app.models.table_seating import TableSeating, TableSeatingTable
from app.models.tab import Tab
from app.schemas.floor_plan import (
    BoardAreaResponse,
    BoardPartyResponse,
    BoardSeatingResponse,
    BoardTableResponse,
    FloorPlanBoardResponse,
)
from app.schemas.customer import GuestBoardContext
from app.services.location_service import get_primary_location as find_primary_location
from app.services.table_qr_service import issue_table_token
from app.services.customer_service import get_guest_context


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
    location = await find_primary_location(db, business_id)
    if location is None:
        raise _conflict("Business has no primary location")
    return location


def resolve_service_window(
    business: Business,
    *,
    service_date: date | None = None,
    now: datetime | None = None,
) -> tuple[date, datetime, datetime]:
    """Resolve one business-local service day to an absolute UTC interval."""
    zone = ZoneInfo(business.timezone)
    current = (now or datetime.now(timezone.utc)).astimezone(zone)
    cutoff = business.service_day_cutoff or time(5, 0)
    resolved_date = service_date or (
        current.date() if current.timetz().replace(tzinfo=None) >= cutoff
        else current.date() - timedelta(days=1)
    )
    local_start = datetime.combine(resolved_date, cutoff, tzinfo=zone)
    local_end = datetime.combine(
        resolved_date + timedelta(days=1), cutoff, tzinfo=zone
    )
    return resolved_date, local_start.astimezone(timezone.utc), local_end.astimezone(timezone.utc)


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


async def issue_table_qr(
    db: AsyncSession,
    business_id: UUID,
    table_id: UUID,
    *,
    rotate: bool = False,
) -> tuple[Table, str]:
    table = await _get_table(db, business_id, table_id, lock=rotate)
    if not table.is_active:
        raise _conflict("Inactive tables cannot receive a QR code")
    if rotate:
        table.qr_token_revision += 1
        await db.flush()
    return table, issue_table_token(table)


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


async def _ensure_reservation_tables_available(
    db: AsyncSession,
    *,
    reservation: Reservation,
    table_ids: list[UUID],
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
) -> None:
    own_buffer = await db.scalar(
        select(ServiceType.resource_turn_buffer_minutes).where(
            ServiceType.id == reservation.service_type_id
        )
    )
    rows = list(
        (
            await db.execute(
                select(
                    ReservationTableAssignment.table_id,
                    Reservation.time,
                    Reservation.ends_at,
                    ServiceType.resource_turn_buffer_minutes,
                )
                .join(Reservation, Reservation.id == ReservationTableAssignment.reservation_id)
                .join(ServiceType, ServiceType.id == Reservation.service_type_id)
                .where(
                    ReservationTableAssignment.table_id.in_(table_ids),
                    Reservation.id != reservation.id,
                    Reservation.status.in_(("pending", "confirmed")),
                )
            )
        ).all()
    )
    candidate_start = starts_at or reservation.time
    candidate_end = ends_at or reservation.ends_at
    if any(
        other_start < candidate_end + timedelta(minutes=own_buffer or 0)
        and other_end + timedelta(minutes=other_buffer or 0) > candidate_start
        for _, other_start, other_end, other_buffer in rows
    ):
        raise _conflict("One or more tables are assigned to an overlapping reservation")


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
    await _ensure_reservation_tables_available(
        db, reservation=reservation, table_ids=table_ids
    )
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
    open_tab = await db.scalar(
        select(Tab.id)
        .where(
            Tab.business_id == business_id,
            Tab.seating_id == seating.id,
            Tab.status == "open",
        )
        .with_for_update()
    )
    if open_tab:
        raise _conflict("Settle the open tab before ending this seating")
    now = datetime.now(timezone.utc)
    seating.status = "closed"
    seating.closed_by = actor_id
    seating.closed_at = now
    table_ids = [member.table_id for member in seating.tables]
    tables = await _locked_tables(db, business_id, table_ids)
    for table in tables:
        if table.operational_state != "out_of_service":
            table.operational_state = "ready"
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


async def get_assignment(
    db: AsyncSession,
    business_id: UUID,
    *,
    source_type: str,
    source_id: UUID,
):
    if source_type == "reservation":
        source = await db.scalar(
            select(Reservation).where(
                Reservation.id == source_id,
                Reservation.business_id == business_id,
            )
        )
        assignment_model = ReservationTableAssignment
        source_column = ReservationTableAssignment.reservation_id
    else:
        source = await db.scalar(
            select(QueueEntry).where(
                QueueEntry.id == source_id,
                QueueEntry.business_id == business_id,
            )
        )
        assignment_model = QueueTableAssignment
        source_column = QueueTableAssignment.queue_entry_id
    if source is None:
        raise _not_found("Reservation" if source_type == "reservation" else "Queue entry")

    rows = list(
        (
            await db.execute(
                select(assignment_model)
                .where(
                    assignment_model.business_id == business_id,
                    source_column == source_id,
                )
                .order_by(assignment_model.table_id)
            )
        ).scalars().all()
    )
    if not rows:
        raise _not_found("Table assignment")
    table_ids = [row.table_id for row in rows]
    tables = list(
        (
            await db.execute(
                select(Table).where(
                    Table.business_id == business_id,
                    Table.id.in_(table_ids),
                )
            )
        ).scalars().all()
    )
    combination = (
        await _matching_combination(db, business_id, set(table_ids))
        if len(table_ids) > 1
        else None
    )
    capacity = (
        combination.capacity_override
        if combination and combination.capacity_override
        else sum(table.capacity for table in tables)
    )
    return source, rows, capacity


async def remove_assignment(
    db: AsyncSession,
    business_id: UUID,
    *,
    source_type: str,
    source_id: UUID,
) -> None:
    source, _, _ = await get_assignment(
        db,
        business_id,
        source_type=source_type,
        source_id=source_id,
    )
    open_seating = await db.scalar(
        select(TableSeating.id).where(
            TableSeating.business_id == business_id,
            TableSeating.status == "open",
            (
                TableSeating.reservation_id == source.id
                if source_type == "reservation"
                else TableSeating.queue_entry_id == source.id
            ),
        )
    )
    if open_seating:
        raise _conflict("Close the active seating before removing its table assignment")
    assignment_model = (
        ReservationTableAssignment
        if source_type == "reservation"
        else QueueTableAssignment
    )
    source_column = (
        ReservationTableAssignment.reservation_id
        if source_type == "reservation"
        else QueueTableAssignment.queue_entry_id
    )
    await db.execute(
        delete(assignment_model).where(
            assignment_model.business_id == business_id,
            source_column == source_id,
        )
    )
    await db.flush()


def _reservation_party(
    reservation: Reservation, assigned_table_ids: list[UUID]
) -> BoardPartyResponse:
    name = (
        reservation.customer.name
        if reservation.customer is not None and reservation.customer.name
        else reservation.phone
    )
    return BoardPartyResponse(
        source_type="reservation",
        source_id=reservation.id,
        name=name,
        party_size=reservation.guests,
        status=reservation.status,
        starts_at=reservation.time,
        ends_at=reservation.ends_at,
        assigned_table_ids=assigned_table_ids,
        customer_id=reservation.customer_id,
    )


def _queue_party(
    entry: QueueEntry, assigned_table_ids: list[UUID]
) -> BoardPartyResponse:
    return BoardPartyResponse(
        source_type="queue",
        source_id=entry.id,
        name=entry.name,
        party_size=entry.party_size,
        status=entry.status,
        assigned_table_ids=assigned_table_ids,
        customer_id=entry.customer_id,
    )


async def get_board(
    db: AsyncSession,
    business: Business,
    *,
    location_id: UUID | None = None,
    service_date: date | None = None,
    now: datetime | None = None,
) -> FloorPlanBoardResponse:
    generated_at = now or datetime.now(timezone.utc)
    resolved_date, starts_at, ends_at = resolve_service_window(
        business, service_date=service_date, now=generated_at
    )
    location = await _get_location(db, business.id, location_id)
    reservation_location_filter = Reservation.location_id == location.id
    queue_location_filter = QueueEntry.location_id == location.id
    if location.is_primary:
        reservation_location_filter = or_(
            reservation_location_filter,
            Reservation.location_id.is_(None),
        )
        queue_location_filter = or_(
            queue_location_filter,
            QueueEntry.location_id.is_(None),
        )

    areas = list(
        (
            await db.execute(
                select(TableArea)
                .where(
                    TableArea.business_id == business.id,
                    TableArea.location_id == location.id,
                    TableArea.deleted_at.is_(None),
                    TableArea.is_active.is_(True),
                )
                .order_by(TableArea.sort_order, TableArea.name)
            )
        ).scalars().all()
    )
    tables = list(
        (
            await db.execute(
                select(Table)
                .where(
                    Table.business_id == business.id,
                    Table.location_id == location.id,
                    Table.deleted_at.is_(None),
                    Table.is_active.is_(True),
                )
                .order_by(Table.area_id, Table.sort_order, Table.label)
            )
        ).scalars().all()
    )

    reservations = list(
        (
            await db.execute(
                select(Reservation)
                .where(
                    Reservation.business_id == business.id,
                    Reservation.status.in_(("pending", "confirmed")),
                    Reservation.time < ends_at,
                    Reservation.ends_at > starts_at,
                    reservation_location_filter,
                )
                .options(selectinload(Reservation.customer))
                .order_by(Reservation.time)
            )
        ).scalars().all()
    )
    queue_entries = list(
        (
            await db.execute(
                select(QueueEntry)
                .where(
                    QueueEntry.business_id == business.id,
                    QueueEntry.status.in_(("waiting", "called")),
                    queue_location_filter,
                )
                .order_by(QueueEntry.joined_at)
            )
        ).scalars().all()
    )

    reservation_ids = [item.id for item in reservations]
    queue_ids = [item.id for item in queue_entries]
    reservation_assignments = list(
        (
            await db.execute(
                select(ReservationTableAssignment).where(
                    ReservationTableAssignment.business_id == business.id,
                    ReservationTableAssignment.location_id == location.id,
                    ReservationTableAssignment.reservation_id.in_(reservation_ids),
                )
            )
        ).scalars().all()
    ) if reservation_ids else []
    queue_assignments = list(
        (
            await db.execute(
                select(QueueTableAssignment).where(
                    QueueTableAssignment.business_id == business.id,
                    QueueTableAssignment.location_id == location.id,
                    QueueTableAssignment.queue_entry_id.in_(queue_ids),
                )
            )
        ).scalars().all()
    ) if queue_ids else []

    reservation_tables: dict[UUID, list[UUID]] = {}
    reservations_by_table: dict[UUID, list[Reservation]] = {}
    for assignment in reservation_assignments:
        reservation_tables.setdefault(assignment.reservation_id, []).append(
            assignment.table_id
        )
    reservations_by_id = {item.id: item for item in reservations}
    for assignment in reservation_assignments:
        reservation = reservations_by_id[assignment.reservation_id]
        reservations_by_table.setdefault(assignment.table_id, []).append(reservation)

    queue_tables: dict[UUID, list[UUID]] = {}
    queues_by_table: dict[UUID, QueueEntry] = {}
    queue_by_id = {item.id: item for item in queue_entries}
    for assignment in queue_assignments:
        queue_tables.setdefault(assignment.queue_entry_id, []).append(assignment.table_id)
        queues_by_table[assignment.table_id] = queue_by_id[assignment.queue_entry_id]

    seatings = list(
        (
            await db.execute(
                select(TableSeating)
                .where(
                    TableSeating.business_id == business.id,
                    TableSeating.location_id == location.id,
                    TableSeating.status == "open",
                )
                .options(selectinload(TableSeating.tables))
                .order_by(TableSeating.opened_at)
            )
        ).scalars().unique().all()
    )
    open_tabs_by_seating = {
        seating_id: tab_id
        for seating_id, tab_id in (
            await db.execute(
                select(Tab.seating_id, Tab.id).where(
                    Tab.business_id == business.id,
                    Tab.status == "open",
                    Tab.seating_id.is_not(None),
                )
            )
        ).all()
    }
    seating_reservation_ids = [
        item.reservation_id
        for item in seatings
        if item.reservation_id and item.reservation_id not in reservations_by_id
    ]
    if seating_reservation_ids:
        extra = list(
            (
                await db.execute(
                    select(Reservation)
                    .where(
                        Reservation.business_id == business.id,
                        Reservation.id.in_(seating_reservation_ids),
                    )
                    .options(selectinload(Reservation.customer))
                )
            ).scalars().all()
        )
        reservations_by_id.update({item.id: item for item in extra})
    seating_queue_ids = [
        item.queue_entry_id
        for item in seatings
        if item.queue_entry_id and item.queue_entry_id not in queue_by_id
    ]
    if seating_queue_ids:
        extra_queue = list(
            (
                await db.execute(
                    select(QueueEntry).where(
                        QueueEntry.business_id == business.id,
                        QueueEntry.id.in_(seating_queue_ids),
                    )
                )
            ).scalars().all()
        )
        queue_by_id.update({item.id: item for item in extra_queue})

    seatings_by_table: dict[UUID, BoardSeatingResponse] = {}
    for seating in seatings:
        seating_table_ids = [item.table_id for item in seating.tables]
        if seating.reservation_id:
            source = _reservation_party(
                reservations_by_id[seating.reservation_id], seating_table_ids
            )
        else:
            source = _queue_party(queue_by_id[seating.queue_entry_id], seating_table_ids)
        response = BoardSeatingResponse(
            seating_id=seating.id,
            source=source,
            table_ids=seating_table_ids,
            opened_at=seating.opened_at,
            open_tab_id=open_tabs_by_seating.get(seating.id),
        )
        for table_id in seating_table_ids:
            seatings_by_table[table_id] = response

    board_areas: list[BoardAreaResponse] = []
    for area in areas:
        board_tables: list[BoardTableResponse] = []
        for table in (item for item in tables if item.area_id == area.id):
            active_seating = seatings_by_table.get(table.id)
            queue_assignment = queues_by_table.get(table.id)
            assigned_reservations = sorted(
                reservations_by_table.get(table.id, []), key=lambda item: item.time
            )
            current_reservation = next(
                (
                    item
                    for item in assigned_reservations
                    if item.time <= generated_at < item.ends_at
                ),
                None,
            )
            next_reservation = next(
                (item for item in assigned_reservations if item.time > generated_at),
                None,
            )
            active_assignment = (
                _queue_party(queue_assignment, queue_tables[queue_assignment.id])
                if queue_assignment
                else (
                    _reservation_party(
                        current_reservation,
                        reservation_tables[current_reservation.id],
                    )
                    if current_reservation
                    else None
                )
            )
            state_expired = (
                table.operational_state == "out_of_service"
                and table.operational_state_until is not None
                and table.operational_state_until <= generated_at
            )
            if active_seating:
                display_state = "occupied"
            elif table.operational_state == "out_of_service" and not state_expired:
                display_state = "out_of_service"
            elif table.operational_state == "cleaning":
                display_state = "cleaning"
            elif active_assignment:
                display_state = "reserved"
            else:
                display_state = "available"
            board_tables.append(
                BoardTableResponse(
                    id=table.id,
                    area_id=table.area_id,
                    label=table.label,
                    capacity=table.capacity,
                    shape=table.shape,
                    sort_order=table.sort_order,
                    display_state=display_state,
                    operational_state=table.operational_state,
                    operational_state_reason=table.operational_state_reason,
                    operational_state_until=table.operational_state_until,
                    operational_state_expired=state_expired,
                    active_seating=active_seating,
                    active_assignment=active_assignment,
                    next_reservation=(
                        _reservation_party(
                            next_reservation,
                            reservation_tables[next_reservation.id],
                        )
                        if next_reservation
                        else None
                    ),
                )
            )
        board_areas.append(
            BoardAreaResponse(
                id=area.id,
                name=area.name,
                sort_order=area.sort_order,
                tables=board_tables,
            )
        )

    board = FloorPlanBoardResponse(
        business_id=business.id,
        location_id=location.id,
        timezone=business.timezone,
        service_date=resolved_date,
        starts_at=starts_at,
        ends_at=ends_at,
        generated_at=generated_at,
        areas=board_areas,
        unassigned_reservations=[
            _reservation_party(item, [])
            for item in reservations
            if item.id not in reservation_tables
        ],
        queue_entries=[
            _queue_party(item, queue_tables.get(item.id, []))
            for item in queue_entries
        ],
    )
    parties: list[BoardPartyResponse] = [
        *board.unassigned_reservations,
        *board.queue_entries,
    ]
    for area in board.areas:
        for table in area.tables:
            if table.active_seating:
                parties.append(table.active_seating.source)
            if table.active_assignment:
                parties.append(table.active_assignment)
            if table.next_reservation:
                parties.append(table.next_reservation)
    contexts: dict[UUID, dict | None] = {}
    for party in parties:
        if party.customer_id is None:
            continue
        if party.customer_id not in contexts:
            contexts[party.customer_id] = await get_guest_context(
                db, business_id=business.id, customer_id=party.customer_id
            )
        context = contexts[party.customer_id]
        party.guest_context = GuestBoardContext(**context) if context else None
    return board
