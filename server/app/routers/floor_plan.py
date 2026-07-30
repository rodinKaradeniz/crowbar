from datetime import date
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    Query,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import DomainEvent, publish
from app.database import get_db
from app.dependencies import (
    get_current_business,
    get_current_user,
    require_any_module,
    require_module,
    require_roles,
)
from app.models.business import Business
from app.models.table_combination import TableCombination
from app.models.table_seating import TableSeating
from app.models.user import User
from app.schemas.floor_plan import (
    AreaCreate,
    AreaResponse,
    AreaUpdate,
    CombinationCreate,
    CombinationResponse,
    CombinationUpdate,
    FloorPlanBoardResponse,
    FloorPlanSettingsResponse,
    FloorPlanSettingsUpdate,
    SeatingOpen,
    SeatingResponse,
    TableAssignmentReplace,
    TableAssignmentResponse,
    TableCreate,
    TableResponse,
    TableQrResponse,
    TableStateUpdate,
    TableUpdate,
)
from app.services import floor_plan_service
from app.services.floor_plan_service import FloorPlanError
from app.services.floor_plan_ws_manager import manager as floor_plan_ws_manager
from app.services.websocket_auth import authorize_staff_websocket


router = APIRouter(
    prefix="/api/floor-plan",
    tags=["floor-plan"],
    dependencies=[Depends(require_any_module("reservations", "queue", "ordering"))],
)
ws_router = APIRouter(tags=["floor-plan"])


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


async def _publish_change(
    event_type: str,
    business_id: UUID,
    *,
    resource_id: UUID | None = None,
    location_id: UUID | None = None,
) -> None:
    payload = {"resource_id": str(resource_id)} if resource_id else {}
    await publish(
        DomainEvent(
            event_type=f"floor_plan.{event_type}",
            business_id=str(business_id),
            location_id=str(location_id) if location_id else None,
            payload=payload,
        )
    )


async def _combination_response(
    db: AsyncSession, combination: TableCombination
) -> CombinationResponse:
    return CombinationResponse(
        id=combination.id,
        business_id=combination.business_id,
        location_id=combination.location_id,
        area_id=combination.area_id,
        name=combination.name,
        table_ids=[member.table_id for member in combination.members],
        capacity_override=combination.capacity_override,
        effective_capacity=await floor_plan_service.combination_capacity(
            db, combination
        ),
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


def _assignment_response(source_type, source, rows, capacity):
    first = rows[0]
    return TableAssignmentResponse(
        source_type=source_type,
        source_id=source.id,
        table_ids=[row.table_id for row in rows],
        assigned_by=first.assigned_by,
        assigned_at=first.assigned_at,
        capacity=capacity,
        capacity_override_reason=first.capacity_override_reason,
    )


@router.get("/settings", response_model=FloorPlanSettingsResponse)
async def get_settings(
    business: Business = Depends(get_current_business),
):
    return FloorPlanSettingsResponse(
        service_day_cutoff=business.service_day_cutoff,
        timezone=business.timezone,
    )


@router.put("/settings", response_model=FloorPlanSettingsResponse)
async def update_settings(
    body: FloorPlanSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    business.service_day_cutoff = body.service_day_cutoff
    await db.commit()
    await _publish_change("settings.updated", business.id)
    return FloorPlanSettingsResponse(
        service_day_cutoff=business.service_day_cutoff,
        timezone=business.timezone,
    )


@router.get("/board", response_model=FloorPlanBoardResponse)
async def get_board(
    service_date: date | None = None,
    location_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    return await floor_plan_service.get_board(
        db,
        business,
        location_id=location_id,
        service_date=service_date,
    )


@router.get("/areas", response_model=list[AreaResponse])
async def list_areas(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    return await floor_plan_service.list_areas(db, business.id)


@router.post("/areas", response_model=AreaResponse, status_code=status.HTTP_201_CREATED)
async def create_area(
    body: AreaCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    area = await floor_plan_service.create_area(
        db,
        business.id,
        location_id=body.location_id,
        name=body.name,
        sort_order=body.sort_order,
    )
    await db.commit()
    await _publish_change(
        "area.created", business.id, resource_id=area.id, location_id=area.location_id
    )
    return area


@router.patch("/areas/{area_id}", response_model=AreaResponse)
async def update_area(
    area_id: UUID,
    body: AreaUpdate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    area = await floor_plan_service.update_area(
        db, business.id, area_id, body.model_dump(exclude_unset=True)
    )
    await db.commit()
    await _publish_change(
        "area.updated", business.id, resource_id=area.id, location_id=area.location_id
    )
    return area


@router.delete("/areas/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_area(
    area_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    await floor_plan_service.archive_area(db, business.id, area_id)
    await db.commit()
    await _publish_change("area.archived", business.id, resource_id=area_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tables", response_model=list[TableResponse])
async def list_tables(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    return await floor_plan_service.list_tables(db, business.id)


@router.post("/tables", response_model=TableResponse, status_code=status.HTTP_201_CREATED)
async def create_table(
    body: TableCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    table = await floor_plan_service.create_table(
        db, business.id, **body.model_dump()
    )
    await db.commit()
    await _publish_change(
        "table.created",
        business.id,
        resource_id=table.id,
        location_id=table.location_id,
    )
    return table


@router.patch("/tables/{table_id}", response_model=TableResponse)
async def update_table(
    table_id: UUID,
    body: TableUpdate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    table = await floor_plan_service.update_table(
        db, business.id, table_id, body.model_dump(exclude_unset=True)
    )
    await db.commit()
    await _publish_change(
        "table.updated",
        business.id,
        resource_id=table.id,
        location_id=table.location_id,
    )
    return table


@router.delete("/tables/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_table(
    table_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    await floor_plan_service.archive_table(db, business.id, table_id)
    await db.commit()
    await _publish_change("table.archived", business.id, resource_id=table_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/tables/{table_id}/state", response_model=TableResponse)
async def set_table_state(
    table_id: UUID,
    body: TableStateUpdate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    user: User = Depends(get_current_user),
):
    table = await floor_plan_service.set_table_state(
        db,
        business.id,
        table_id,
        state=body.state,
        reason=body.reason,
        until=body.until,
        actor_id=user.id,
    )
    await db.commit()
    await _publish_change(
        "table.state_changed",
        business.id,
        resource_id=table.id,
        location_id=table.location_id,
    )
    return table


async def _table_qr_response(
    db: AsyncSession, business: Business, table_id: UUID, *, rotate: bool = False
) -> TableQrResponse:
    table, token = await floor_plan_service.issue_table_qr(
        db, business.id, table_id, rotate=rotate
    )
    return TableQrResponse(
        table_id=table.id,
        label=table.label,
        revision=table.qr_token_revision,
        url=f"/menu/{business.slug}?table_token={token}",
    )


@router.get("/tables/{table_id}/qr", response_model=TableQrResponse)
async def get_table_qr(
    table_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    return await _table_qr_response(db, business, table_id)


@router.post("/tables/{table_id}/qr/rotate", response_model=TableQrResponse)
async def rotate_table_qr(
    table_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    response = await _table_qr_response(db, business, table_id, rotate=True)
    await db.commit()
    await _publish_change("table.qr_rotated", business.id, resource_id=table_id)
    return response


@router.get("/combinations", response_model=list[CombinationResponse])
async def list_combinations(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    items = await floor_plan_service.list_combinations(db, business.id)
    return [await _combination_response(db, item) for item in items]


@router.post(
    "/combinations",
    response_model=CombinationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_combination(
    body: CombinationCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    combination = await floor_plan_service.create_combination(
        db, business.id, **body.model_dump()
    )
    await db.commit()
    await _publish_change(
        "combination.created",
        business.id,
        resource_id=combination.id,
        location_id=combination.location_id,
    )
    return await _combination_response(db, combination)


@router.patch("/combinations/{combination_id}", response_model=CombinationResponse)
async def update_combination(
    combination_id: UUID,
    body: CombinationUpdate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    _: User = Depends(require_roles("owner", "manager")),
):
    combination = await floor_plan_service.update_combination(
        db, business.id, combination_id, body.model_dump(exclude_unset=True)
    )
    await db.commit()
    await _publish_change(
        "combination.updated",
        business.id,
        resource_id=combination.id,
        location_id=combination.location_id,
    )
    return await _combination_response(db, combination)


@router.get(
    "/reservations/{reservation_id}/tables",
    response_model=TableAssignmentResponse,
    dependencies=[Depends(require_module("reservations"))],
)
async def get_reservation_assignment(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    source, rows, capacity = await floor_plan_service.get_assignment(
        db,
        business.id,
        source_type="reservation",
        source_id=reservation_id,
    )
    return _assignment_response("reservation", source, rows, capacity)


@router.put(
    "/reservations/{reservation_id}/tables",
    response_model=TableAssignmentResponse,
    dependencies=[Depends(require_module("reservations"))],
)
async def assign_reservation_tables(
    reservation_id: UUID,
    body: TableAssignmentReplace,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    user: User = Depends(get_current_user),
):
    reservation, tables, capacity, assigned_at, reason = (
        await floor_plan_service.replace_reservation_assignment(
            db,
            business.id,
            reservation_id,
            body.table_ids,
            user.id,
            _can_override(user, business.id),
            body.capacity_override_reason,
        )
    )
    await db.commit()
    await _publish_change(
        "reservation_assignment.replaced",
        business.id,
        resource_id=reservation.id,
        location_id=tables[0].location_id,
    )
    return TableAssignmentResponse(
        source_type="reservation",
        source_id=reservation.id,
        table_ids=[table.id for table in tables],
        assigned_by=user.id,
        assigned_at=assigned_at,
        capacity=capacity,
        capacity_override_reason=reason,
    )


@router.delete(
    "/reservations/{reservation_id}/tables",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_module("reservations"))],
)
async def remove_reservation_assignment(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    await floor_plan_service.remove_assignment(
        db,
        business.id,
        source_type="reservation",
        source_id=reservation_id,
    )
    await db.commit()
    await _publish_change(
        "reservation_assignment.removed",
        business.id,
        resource_id=reservation_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/queue/{entry_id}/tables",
    response_model=TableAssignmentResponse,
    dependencies=[Depends(require_module("queue"))],
)
async def get_queue_assignment(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    source, rows, capacity = await floor_plan_service.get_assignment(
        db, business.id, source_type="queue", source_id=entry_id
    )
    return _assignment_response("queue", source, rows, capacity)


@router.put(
    "/queue/{entry_id}/tables",
    response_model=TableAssignmentResponse,
    dependencies=[Depends(require_module("queue"))],
)
async def assign_queue_tables(
    entry_id: UUID,
    body: TableAssignmentReplace,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    user: User = Depends(get_current_user),
):
    entry, tables, capacity, assigned_at, reason = (
        await floor_plan_service.replace_queue_assignment(
            db,
            business.id,
            entry_id,
            body.table_ids,
            user.id,
            _can_override(user, business.id),
            body.capacity_override_reason,
        )
    )
    await db.commit()
    await _publish_change(
        "queue_assignment.replaced",
        business.id,
        resource_id=entry.id,
        location_id=tables[0].location_id,
    )
    return TableAssignmentResponse(
        source_type="queue",
        source_id=entry.id,
        table_ids=[table.id for table in tables],
        assigned_by=user.id,
        assigned_at=assigned_at,
        capacity=capacity,
        capacity_override_reason=reason,
    )


@router.delete(
    "/queue/{entry_id}/tables",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_module("queue"))],
)
async def remove_queue_assignment(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    await floor_plan_service.remove_assignment(
        db, business.id, source_type="queue", source_id=entry_id
    )
    await db.commit()
    await _publish_change(
        "queue_assignment.removed", business.id, resource_id=entry_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/seatings", response_model=SeatingResponse, status_code=status.HTTP_201_CREATED
)
async def open_seating(
    body: SeatingOpen,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    user: User = Depends(get_current_user),
):
    required_module = (
        "reservations" if body.source_type == "reservation" else "queue"
    )
    if required_module not in (business.enabled_modules or []):
        raise FloorPlanError(
            403,
            f"Module '{required_module}' is not enabled for this business",
            code="MODULE_DISABLED",
        )
    seating = await floor_plan_service.open_seating(
        db,
        business.id,
        body.source_type,
        body.source_id,
        body.table_ids,
        user.id,
        _can_override(user, business.id),
        body.capacity_override_reason,
    )
    await db.commit()
    await _publish_change(
        "seating.opened",
        business.id,
        resource_id=seating.id,
        location_id=seating.location_id,
    )
    return _seating_response(seating)


@router.post("/seatings/{seating_id}/close", response_model=SeatingResponse)
async def close_seating(
    seating_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
    user: User = Depends(get_current_user),
):
    seating = await floor_plan_service.close_seating(
        db, business.id, seating_id, user.id
    )
    await db.commit()
    await _publish_change(
        "seating.closed",
        business.id,
        resource_id=seating.id,
        location_id=seating.location_id,
    )
    return _seating_response(seating)


@ws_router.websocket("/ws/floor-plan/{business_id}")
async def floor_plan_websocket(
    ws: WebSocket,
    business_id: UUID,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    authorized = await authorize_staff_websocket(
        db,
        ws,
        token=token,
        business_id=business_id,
        required_modules=("reservations", "queue", "ordering"),
    )
    if not authorized:
        return
    business_key = str(business_id)
    await floor_plan_ws_manager.connect(business_key, ws)
    try:
        await ws.send_json({"type": "floor_plan_updated"})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        floor_plan_ws_manager.disconnect(business_key, ws)
