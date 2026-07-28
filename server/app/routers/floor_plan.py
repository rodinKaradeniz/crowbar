from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_any_module, require_module, require_roles
from app.models.business import Business
from app.models.table_combination import TableCombination
from app.models.table_seating import TableSeating
from app.models.user import User
from app.schemas.floor_plan import (
    AreaCreate, AreaResponse, AreaUpdate, CombinationCreate,
    CombinationResponse, CombinationUpdate, SeatingOpen, SeatingResponse,
    TableAssignmentReplace, TableAssignmentResponse, TableCreate,
    TableResponse, TableStateUpdate, TableUpdate,
)
from app.services import floor_plan_service
from app.services.floor_plan_service import FloorPlanError


router = APIRouter(
    prefix="/api/floor-plan",
    tags=["floor-plan"],
    dependencies=[Depends(require_any_module("reservations", "queue", "ordering"))],
)


async def floor_plan_error_handler(request: Request, exc: FloorPlanError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message, "details": None},
    )


def _can_override(user: User, business_id: UUID) -> bool:
    return any(
        assignment.business_id == business_id
        and assignment.role in {"owner", "manager"}
        for assignment in user.staff_assignments
    )


async def _combination_response(db, combination: TableCombination) -> CombinationResponse:
    return CombinationResponse(
        id=combination.id,
        business_id=combination.business_id,
        location_id=combination.location_id,
        area_id=combination.area_id,
        name=combination.name,
        table_ids=[member.table_id for member in combination.members],
        capacity_override=combination.capacity_override,
        effective_capacity=await floor_plan_service.combination_capacity(db, combination),
        is_active=combination.is_active,
        created_at=combination.created_at,
        updated_at=combination.updated_at,
    )


def _seating_response(seating: TableSeating) -> SeatingResponse:
    source_type = "reservation" if seating.reservation_id else "queue"
    return SeatingResponse(
        id=seating.id,
        business_id=seating.business_id,
        location_id=seating.location_id,
        source_type=source_type,
        source_id=seating.reservation_id or seating.queue_entry_id,
        table_ids=[member.table_id for member in seating.tables],
        party_size=seating.party_size,
        status=seating.status,
        opened_by=seating.opened_by,
        opened_at=seating.opened_at,
        closed_by=seating.closed_by,
        closed_at=seating.closed_at,
    )


@router.get("/areas", response_model=list[AreaResponse])
async def list_areas(db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business)):
    return await floor_plan_service.list_areas(db, business.id)


@router.post("/areas", response_model=AreaResponse, status_code=status.HTTP_201_CREATED)
async def create_area(body: AreaCreate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), _: User = Depends(require_roles("owner", "manager"))):
    area = await floor_plan_service.create_area(
        db, business.id, location_id=body.location_id, name=body.name,
        sort_order=body.sort_order,
    )
    await db.commit()
    return area


@router.patch("/areas/{area_id}", response_model=AreaResponse)
async def update_area(area_id: UUID, body: AreaUpdate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), _: User = Depends(require_roles("owner", "manager"))):
    area = await floor_plan_service.update_area(
        db, business.id, area_id, body.model_dump(exclude_unset=True)
    )
    await db.commit()
    return area


@router.delete("/areas/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_area(area_id: UUID, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), _: User = Depends(require_roles("owner", "manager"))):
    await floor_plan_service.archive_area(db, business.id, area_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tables", response_model=list[TableResponse])
async def list_tables(db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business)):
    return await floor_plan_service.list_tables(db, business.id)


@router.post("/tables", response_model=TableResponse, status_code=status.HTTP_201_CREATED)
async def create_table(body: TableCreate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), _: User = Depends(require_roles("owner", "manager"))):
    table = await floor_plan_service.create_table(db, business.id, **body.model_dump())
    await db.commit()
    return table


@router.patch("/tables/{table_id}", response_model=TableResponse)
async def update_table(table_id: UUID, body: TableUpdate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), _: User = Depends(require_roles("owner", "manager"))):
    table = await floor_plan_service.update_table(
        db, business.id, table_id, body.model_dump(exclude_unset=True)
    )
    await db.commit()
    return table


@router.delete("/tables/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_table(table_id: UUID, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), _: User = Depends(require_roles("owner", "manager"))):
    await floor_plan_service.archive_table(db, business.id, table_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/tables/{table_id}/state", response_model=TableResponse)
async def set_table_state(table_id: UUID, body: TableStateUpdate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), user: User = Depends(get_current_user)):
    table = await floor_plan_service.set_table_state(
        db, business.id, table_id, state=body.state, reason=body.reason,
        until=body.until, actor_id=user.id,
    )
    await db.commit()
    return table


@router.get("/combinations", response_model=list[CombinationResponse])
async def list_combinations(db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business)):
    items = await floor_plan_service.list_combinations(db, business.id)
    return [await _combination_response(db, item) for item in items]


@router.post("/combinations", response_model=CombinationResponse, status_code=status.HTTP_201_CREATED)
async def create_combination(body: CombinationCreate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), _: User = Depends(require_roles("owner", "manager"))):
    combination = await floor_plan_service.create_combination(db, business.id, **body.model_dump())
    await db.commit()
    return await _combination_response(db, combination)


@router.patch("/combinations/{combination_id}", response_model=CombinationResponse)
async def update_combination(combination_id: UUID, body: CombinationUpdate, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), _: User = Depends(require_roles("owner", "manager"))):
    combination = await floor_plan_service.update_combination(
        db, business.id, combination_id, body.model_dump(exclude_unset=True)
    )
    await db.commit()
    return await _combination_response(db, combination)


@router.put("/reservations/{reservation_id}/tables", response_model=TableAssignmentResponse, dependencies=[Depends(require_module("reservations"))])
async def assign_reservation_tables(reservation_id: UUID, body: TableAssignmentReplace, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), user: User = Depends(get_current_user)):
    reservation, tables, capacity, assigned_at, reason = await floor_plan_service.replace_reservation_assignment(
        db, business.id, reservation_id, body.table_ids, user.id,
        _can_override(user, business.id), body.capacity_override_reason,
    )
    await db.commit()
    return TableAssignmentResponse(
        source_type="reservation", source_id=reservation.id,
        table_ids=[table.id for table in tables], assigned_by=user.id,
        assigned_at=assigned_at, capacity=capacity,
        capacity_override_reason=reason,
    )


@router.put("/queue/{entry_id}/tables", response_model=TableAssignmentResponse, dependencies=[Depends(require_module("queue"))])
async def assign_queue_tables(entry_id: UUID, body: TableAssignmentReplace, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), user: User = Depends(get_current_user)):
    entry, tables, capacity, assigned_at, reason = await floor_plan_service.replace_queue_assignment(
        db, business.id, entry_id, body.table_ids, user.id,
        _can_override(user, business.id), body.capacity_override_reason,
    )
    await db.commit()
    return TableAssignmentResponse(
        source_type="queue", source_id=entry.id,
        table_ids=[table.id for table in tables], assigned_by=user.id,
        assigned_at=assigned_at, capacity=capacity,
        capacity_override_reason=reason,
    )


@router.post("/seatings", response_model=SeatingResponse, status_code=status.HTTP_201_CREATED)
async def open_seating(body: SeatingOpen, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), user: User = Depends(get_current_user)):
    required_module = "reservations" if body.source_type == "reservation" else "queue"
    if required_module not in (business.enabled_modules or []):
        raise FloorPlanError(403, f"Module '{required_module}' is not enabled for this business", code="MODULE_DISABLED")
    seating = await floor_plan_service.open_seating(
        db, business.id, body.source_type, body.source_id, body.table_ids,
        user.id, _can_override(user, business.id), body.capacity_override_reason,
    )
    await db.commit()
    return _seating_response(seating)


@router.post("/seatings/{seating_id}/close", response_model=SeatingResponse)
async def close_seating(seating_id: UUID, db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business), user: User = Depends(get_current_user)):
    seating = await floor_plan_service.close_seating(db, business.id, seating_id, user.id)
    await db.commit()
    return _seating_response(seating)
