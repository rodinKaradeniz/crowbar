import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import DomainEvent, publish
from app.core.rate_limit import (
    PUBLIC_ORDER_IP_LIMIT,
    RateLimitCheck,
    enforce_public_read_limit,
    enforce_rate_limits,
    get_client_ip,
)
from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_module, require_roles
from app.models.business import Business
from app.models.user import User
from app.schemas.menu import (
    LibraryItemCreate,
    LibraryItemResponse,
    LibraryItemUpdate,
    MenuCategoryCreate,
    MenuCategoryResponse,
    MenuCategoryUpdate,
    MenuCreate,
    MenuItemCreate,
    MenuItemAvailabilityUpdate,
    MenuItemResponse,
    MenuItemUpdate,
    MenuResponse,
    MenuUpdate,
    ModifierCreate,
    ModifierGroupCreate,
    ModifierGroupResponse,
    ModifierResponse,
    OrderingSettingsUpdate,
    PreparationStationCreate,
    PreparationStationResponse,
    PreparationStationUpdate,
)
from app.schemas.order import (
    OrderAllDayCount,
    OrderCancellationRequest,
    OrderCorrectionRequest,
    OrderLineStatusUpdateRequest,
    OrderPlaceRequest,
    OrderResponse,
    OrderStatusUpdateRequest,
)
from app.schemas.recipe import (
    MenuItemStockFlag,
    RecipeIngredientResponse,
    RecipeSetRequest,
)
from app.services import (
    happy_hour_service,
    menu_service,
    order_service,
    preparation_station_service,
    recipe_service,
    tab_service,
    table_qr_service,
    tax_service,
)
from app.services.order_ws_manager import manager
from app.services.websocket_auth import authorize_staff_websocket

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ordering"])


def _can_manage_tax(user: User) -> bool:
    return bool(
        user.staff_assignments
        and user.staff_assignments[0].role in {"owner", "manager"}
    )


# ─── helpers ──────────────────────────────────────────────────────────────────

async def _load_business_or_404(db: AsyncSession, business_id: UUID) -> Business:
    result = await db.execute(select(Business).where(Business.id == business_id))
    b = result.scalar_one_or_none()
    if b is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    return b



# ─── Public: Menu ──────────────────────────────────────────────────────────────

@router.get(
    "/api/ordering/{business_id}/menu",
    response_model=MenuResponse | None,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_public_menu(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Returns the active menu with all categories, items, and modifier groups."""
    business = await _load_business_or_404(db, business_id)
    if "ordering" not in (business.enabled_modules or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu not found")
    menu = await menu_service.get_active_menu(db, business_id)
    if menu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active menu found")
    # Compute happy-hour state server-side (client clocks can't be trusted) and
    # stamp it as a transient attribute the response schema reads. Items carry
    # their own happy_hour_price so the client can render the discount.
    menu.happy_hour_active = await happy_hour_service.is_happy_hour_active(db, business_id)
    return menu


# ─── Public: Orders ────────────────────────────────────────────────────────────

@router.post(
    "/api/ordering/{business_id}/orders",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def place_order(
    business_id: UUID,
    body: OrderPlaceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Customer places an order. Idempotent via idempotency_key."""
    await enforce_rate_limits(
        RateLimitCheck(
            policy=PUBLIC_ORDER_IP_LIMIT,
            key_parts=("order_place", str(business_id), get_client_ip(request)),
        ),
    )

    b = await _load_business_or_404(db, business_id)
    if "ordering" not in (b.enabled_modules or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordering not found")
    if not getattr(b, "is_accepting_orders", True):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="This business is not currently accepting orders.",
        )
    if body.table_identifier:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Table QR ordering no longer accepts a typed table label",
        )
    if not body.table_token:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Scan the table QR code to place a dine-in order",
        )
    # Public endpoint = customer self-service channel → enforce the age gate.
    try:
        table, seating = await table_qr_service.resolve_active_table_seating(
            db, business_id=business_id, token=body.table_token
        )
        tab = await tab_service.open_seating_tab(
            db,
            business_id=business_id,
            seating_id=seating.id,
            opened_by=None,
            table_id=table.id,
            channel="qr",
        )
        order, created = await order_service.place_order(
            db,
            business_id,
            body,
            table_id=table.id,
            tab_id=tab.id,
            customer_id=tab.customer_id,
            channel="qr",
        )
    except order_service.OrderIdempotencyConflict as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except (
        order_service.AgeConfirmationRequired,
        order_service.OrderValidationError,
        table_qr_service.TableQrError,
        ValueError,
    ) as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    await db.commit()
    if created:
        await publish(DomainEvent(
            event_type="order.placed",
            business_id=str(business_id),
            payload={"order_id": str(order.id), "tab_id": str(tab.id)},
        ))
        await publish(DomainEvent(
            event_type="floor_plan.tab_updated",
            business_id=str(business_id),
            payload={"tab_id": str(tab.id), "seating_id": str(seating.id)},
        ))
    return order


@router.get(
    "/api/ordering/{business_id}/orders/status",
    response_model=list[OrderResponse],
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_order_status(
    business_id: UUID,
    session_token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Customer checks their order(s) by session token."""
    business = await _load_business_or_404(db, business_id)
    if "ordering" not in (business.enabled_modules or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordering not found")
    orders = await order_service.get_order_by_session(db, business_id, session_token)
    return orders


# ─── Staff: Orders ─────────────────────────────────────────────────────────────

@router.get(
    "/api/ordering/{business_id}/orders",
    response_model=list[OrderResponse],
    dependencies=[Depends(require_module("ordering"))],
)
async def list_orders(
    business_id: UUID,
    status_filter: list[str] | None = Query(default=None, alias="status"),
    routing_tag: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    orders = await order_service.get_orders_for_board(db, business_id, status_filter, routing_tag)
    return orders


@router.patch(
    "/api/ordering/{business_id}/orders/{order_id}/status",
    response_model=OrderResponse,
    dependencies=[Depends(require_module("ordering"))],
)
async def update_order_status(
    business_id: UUID,
    order_id: UUID,
    body: OrderStatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        order = await order_service.advance_order_status(
            db, order_id, business_id, body, changed_by=current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    await db.commit()
    await publish(DomainEvent(
        event_type="order.status_changed",
        business_id=str(business_id),
        payload={"order_id": str(order.id), "status": order.status},
    ))
    return order


@router.patch(
    "/api/ordering/{business_id}/orders/{order_id}/lines/{line_id}/status",
    response_model=OrderResponse,
    dependencies=[Depends(require_module("ordering"))],
)
async def update_order_line_status(
    business_id: UUID,
    order_id: UUID,
    line_id: UUID,
    body: OrderLineStatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order line not found")
    try:
        order = await order_service.advance_order_line_status(
            db,
            business_id=business.id,
            order_id=order_id,
            line_id=line_id,
            request=body,
            changed_by=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order line not found")
    await db.commit()
    await publish(DomainEvent(
        event_type="order.line_status_changed",
        business_id=str(business.id),
        payload={"order_id": str(order.id), "line_id": str(line_id), "status": body.status},
    ))
    return order


@router.post(
    "/api/ordering/{business_id}/orders/{order_id}/correct",
    response_model=OrderResponse,
    dependencies=[Depends(require_module("ordering"))],
)
async def correct_order(
    business_id: UUID,
    order_id: UUID,
    body: OrderCorrectionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    try:
        order, changed = await order_service.correct_order(
            db,
            business_id=business.id,
            order_id=order_id,
            request=body,
            actor_id=current_user.id,
        )
    except order_service.OrderIdempotencyConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except order_service.OrderValidationError as exc:
        code = 409 if "corrected" in str(exc) or "preparation" in str(exc) or "Settled" in str(exc) else 422
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    await db.commit()
    if changed:
        await publish(DomainEvent(
            event_type="order.corrected",
            business_id=str(business.id),
            payload={"order_id": str(order.id), "tab_id": str(order.tab_id) if order.tab_id else None},
        ))
    return order


@router.post(
    "/api/ordering/{business_id}/orders/{order_id}/cancel",
    response_model=OrderResponse,
    dependencies=[Depends(require_module("ordering"))],
)
async def cancel_order(
    business_id: UUID,
    order_id: UUID,
    body: OrderCancellationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    try:
        order, changed = await order_service.cancel_order(
            db,
            business_id=business.id,
            order_id=order_id,
            request=body,
            actor_id=current_user.id,
        )
    except (order_service.OrderIdempotencyConflict, order_service.OrderValidationError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    await db.commit()
    if changed:
        await publish(DomainEvent(
            event_type="order.cancelled",
            business_id=str(business.id),
            payload={"order_id": str(order.id), "tab_id": str(order.tab_id) if order.tab_id else None},
        ))
    return order


@router.get(
    "/api/ordering/all-day-counts",
    response_model=list[OrderAllDayCount],
    dependencies=[Depends(require_module("ordering"))],
)
async def get_all_day_counts(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    return await order_service.get_all_day_counts(db, business.id)


# ─── Staff: Preparation stations ──────────────────────────────────────────────

@router.get(
    "/api/ordering/stations",
    response_model=list[PreparationStationResponse],
    dependencies=[Depends(require_module("ordering"))],
)
async def list_preparation_stations(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    return await preparation_station_service.list_stations(db, business.id)


@router.post(
    "/api/ordering/stations",
    response_model=PreparationStationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_module("ordering")),
        Depends(require_roles("owner", "manager")),
    ],
)
async def create_preparation_station(
    body: PreparationStationCreate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    try:
        station = await preparation_station_service.create_station(
            db, business.id, name=body.name, sort_order=body.sort_order
        )
    except preparation_station_service.PreparationStationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    await db.commit()
    await publish(DomainEvent(
        event_type="order.station_changed",
        business_id=str(business.id),
        payload={"station_id": str(station.id), "action": "created"},
    ))
    return station


@router.patch(
    "/api/ordering/stations/{station_id}",
    response_model=PreparationStationResponse,
    dependencies=[
        Depends(require_module("ordering")),
        Depends(require_roles("owner", "manager")),
    ],
)
async def update_preparation_station(
    station_id: UUID,
    body: PreparationStationUpdate,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    try:
        station = await preparation_station_service.update_station(
            db,
            business.id,
            station_id,
            changes=body.model_dump(exclude_unset=True),
        )
    except preparation_station_service.PreparationStationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    await db.commit()
    await publish(DomainEvent(
        event_type="order.station_changed",
        business_id=str(business.id),
        payload={"station_id": str(station.id), "action": "updated"},
    ))
    return station


@router.post(
    "/api/ordering/stations/{station_id}/archive",
    response_model=PreparationStationResponse,
    dependencies=[
        Depends(require_module("ordering")),
        Depends(require_roles("owner", "manager")),
    ],
)
async def archive_preparation_station(
    station_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    try:
        station = await preparation_station_service.archive_station(
            db, business.id, station_id, actor_id=current_user.id
        )
    except preparation_station_service.PreparationStationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    await db.commit()
    await publish(DomainEvent(
        event_type="order.station_changed",
        business_id=str(business.id),
        payload={"station_id": str(station.id), "action": "archived"},
    ))
    return station


# ─── Staff: Menu Management ────────────────────────────────────────────────────

@router.get(
    "/api/ordering/{business_id}/menus",
    response_model=list[MenuResponse],
    dependencies=[Depends(require_module("ordering"))],
)
async def list_menus(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await menu_service.list_menus(db, business_id)


@router.post(
    "/api/ordering/{business_id}/menus",
    response_model=MenuResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module("ordering"))],
)
async def create_menu(
    business_id: UUID,
    body: MenuCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if any(category.items for category in body.categories) and not _can_manage_tax(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners and managers can create priced items")
    try:
        menu = await menu_service.create_menu(db, business_id, body)
    except tax_service.TaxProfileError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except preparation_station_service.PreparationStationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    await db.commit()
    await db.refresh(menu, ["categories"])
    return menu


@router.patch(
    "/api/ordering/{business_id}/menus/{menu_id}",
    response_model=MenuResponse,
    dependencies=[Depends(require_module("ordering"))],
)
async def update_menu(
    business_id: UUID,
    menu_id: UUID,
    body: MenuUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    menu = await menu_service.update_menu(db, menu_id, business_id, body)
    if menu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu not found")
    await db.commit()
    return menu


@router.delete(
    "/api/ordering/{business_id}/menus/{menu_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_module("ordering"))],
)
async def delete_menu(
    business_id: UUID,
    menu_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    deleted = await menu_service.delete_menu(db, menu_id, business_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu not found")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Staff: Categories ─────────────────────────────────────────────────────────

@router.post(
    "/api/ordering/{business_id}/menus/{menu_id}/categories",
    response_model=MenuCategoryResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module("ordering"))],
)
async def create_category(
    business_id: UUID,
    menu_id: UUID,
    body: MenuCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if body.items and not _can_manage_tax(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners and managers can create priced items")
    try:
        cat = await menu_service.create_category(db, menu_id, business_id, body)
    except tax_service.TaxProfileError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except preparation_station_service.PreparationStationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if cat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu not found")
    await db.commit()
    await db.refresh(cat, ["items"])
    return cat


@router.patch(
    "/api/ordering/{business_id}/categories/{category_id}",
    response_model=MenuCategoryResponse,
    dependencies=[Depends(require_module("ordering"))],
)
async def update_category(
    business_id: UUID,
    category_id: UUID,
    body: MenuCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    cat = await menu_service.update_category(db, category_id, business_id, body)
    if cat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    await db.commit()
    return cat


@router.delete(
    "/api/ordering/{business_id}/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_module("ordering"))],
)
async def delete_category(
    business_id: UUID,
    category_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    deleted = await menu_service.delete_category(db, category_id, business_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Staff: Items ──────────────────────────────────────────────────────────────

@router.post(
    "/api/ordering/{business_id}/categories/{category_id}/items",
    response_model=MenuItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module("ordering"))],
)
async def create_item(
    business_id: UUID,
    category_id: UUID,
    body: MenuItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if not _can_manage_tax(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners and managers can create priced items")
    try:
        item = await menu_service.create_item(db, category_id, business_id, body)
    except tax_service.TaxProfileError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except preparation_station_service.PreparationStationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    await db.commit()
    return item


@router.patch(
    "/api/ordering/{business_id}/items/{item_id}",
    response_model=MenuItemResponse,
    dependencies=[Depends(require_module("ordering"))],
)
async def update_item(
    business_id: UUID,
    item_id: UUID,
    body: MenuItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if body.tax_profile_id is not None and not _can_manage_tax(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners and managers can assign tax profiles")
    try:
        item = await menu_service.update_item(db, item_id, business_id, body)
    except tax_service.TaxProfileError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except preparation_station_service.PreparationStationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.commit()
    return item


@router.put(
    "/api/ordering/items/{item_id}/availability",
    response_model=MenuItemResponse,
    dependencies=[Depends(require_module("ordering"))],
)
async def update_item_availability(
    item_id: UUID,
    body: MenuItemAvailabilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    item = await menu_service.set_item_availability(
        db,
        item_id,
        business.id,
        is_available=body.is_available,
        source="manual",
        actor_id=current_user.id,
        reason=body.reason,
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.commit()
    await publish(DomainEvent(
        event_type="menu.item_availability_changed",
        business_id=str(business.id),
        payload={"item_id": str(item.id), "is_available": item.is_available},
    ))
    return item


@router.delete(
    "/api/ordering/{business_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_module("ordering"))],
)
async def delete_item(
    business_id: UUID,
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    deleted = await menu_service.delete_item(db, item_id, business_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Staff: Recipes (menu_item_ingredients) ────────────────────────────────────

@router.get(
    "/api/ordering/{business_id}/items/{item_id}/recipe",
    response_model=list[RecipeIngredientResponse],
    dependencies=[Depends(require_module("ordering"))],
)
async def get_item_recipe(
    business_id: UUID,
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    recipe = await recipe_service.get_recipe(db, item_id, business_id)
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return recipe


@router.put(
    "/api/ordering/{business_id}/items/{item_id}/recipe",
    response_model=list[RecipeIngredientResponse],
    dependencies=[Depends(require_module("ordering"))],
)
async def set_item_recipe(
    business_id: UUID,
    item_id: UUID,
    body: RecipeSetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        recipe = await recipe_service.set_recipe(
            db, item_id, business_id, body.ingredients
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.commit()
    return recipe


@router.get(
    "/api/ordering/{business_id}/menu-item-stock-flags",
    response_model=list[MenuItemStockFlag],
    dependencies=[Depends(require_module("ordering"))],
)
async def get_menu_item_stock_flags(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    """Per-menu-item stock info (only items with a recipe): low-stock flag for the
    amber badge + recipe-exact live servings-remaining count."""
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await recipe_service.get_menu_item_stock_info(db, business_id)


# ─── Staff: Modifier Groups ────────────────────────────────────────────────────

@router.post(
    "/api/ordering/{business_id}/items/{item_id}/modifier-groups",
    response_model=ModifierGroupResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module("ordering"))],
)
async def create_modifier_group(
    business_id: UUID,
    item_id: UUID,
    body: ModifierGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    group = await menu_service.create_modifier_group(db, item_id, business_id, body)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.commit()
    await db.refresh(group, ["modifiers"])
    return group


@router.post(
    "/api/ordering/{business_id}/modifier-groups/{group_id}/modifiers",
    response_model=ModifierResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module("ordering"))],
)
async def create_modifier(
    business_id: UUID,
    group_id: UUID,
    body: ModifierCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    mod = await menu_service.create_modifier(db, group_id, business_id, body)
    if mod is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modifier group not found")
    await db.commit()
    return mod


@router.delete(
    "/api/ordering/{business_id}/modifier-groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_module("ordering"))],
)
async def delete_modifier_group(
    business_id: UUID,
    group_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    deleted = await menu_service.delete_modifier_group(db, group_id, business_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modifier group not found")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── WebSocket ─────────────────────────────────────────────────────────────────

@router.websocket("/ws/orders/{business_id}")
async def orders_websocket(
    business_id: UUID,
    ws: WebSocket,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Staff WebSocket authenticated by a short-lived, scoped credential."""
    if not await authorize_staff_websocket(
        db,
        ws,
        token=token,
        business_id=business_id,
        required_modules=("ordering",),
    ):
        return

    bid = str(business_id)
    await manager.connect(bid, ws)

    # Send current board state immediately on connect
    orders = await order_service.get_orders_for_board(db, business_id)
    payload_orders = [order_service.order_to_dict(o) for o in orders]

    try:
        await ws.send_json({"type": "order_updated", "orders": payload_orders})
        async for _ in ws.iter_text():
            pass  # staff only receives; no client→server messages needed
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(bid, ws)


# ─── Staff: Ordering settings ──────────────────────────────────────────────────

@router.patch(
    "/api/ordering/{business_id}/settings",
    dependencies=[Depends(require_module("ordering"))],
)
async def update_ordering_settings(
    business_id: UUID,
    body: OrderingSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    result = await db.execute(select(Business).where(Business.id == business_id))
    b = result.scalar_one_or_none()
    if b is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    b.is_accepting_orders = body.is_accepting_orders
    await db.commit()
    await db.refresh(b)
    return {"is_accepting_orders": b.is_accepting_orders}


@router.get(
    "/api/ordering/{business_id}/settings",
)
async def get_ordering_settings(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Public — customer menu page uses this to check if orders are open."""
    result = await db.execute(select(Business).where(Business.id == business_id))
    b = result.scalar_one_or_none()
    if b is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    return {"is_accepting_orders": getattr(b, "is_accepting_orders", True)}


# ─── Staff: Item Library ───────────────────────────────────────────────────────

@router.get(
    "/api/ordering/{business_id}/library",
    response_model=list[LibraryItemResponse],
    dependencies=[Depends(require_module("ordering"))],
)
async def list_library(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await menu_service.list_library_items(db, business_id)


@router.post(
    "/api/ordering/{business_id}/library",
    response_model=LibraryItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module("ordering"))],
)
async def create_library_item(
    business_id: UUID,
    body: LibraryItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if not _can_manage_tax(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners and managers can create priced items")
    try:
        item = await menu_service.create_library_item(db, business_id, body)
    except tax_service.TaxProfileError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except preparation_station_service.PreparationStationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    await db.commit()
    return item


@router.patch(
    "/api/ordering/{business_id}/library/{item_id}",
    response_model=LibraryItemResponse,
    dependencies=[Depends(require_module("ordering"))],
)
async def update_library_item(
    business_id: UUID,
    item_id: UUID,
    body: LibraryItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if body.tax_profile_id is not None and not _can_manage_tax(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners and managers can assign tax profiles")
    try:
        item = await menu_service.update_library_item(db, item_id, business_id, body)
    except tax_service.TaxProfileError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except preparation_station_service.PreparationStationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library item not found")
    await db.commit()
    return item


@router.delete(
    "/api/ordering/{business_id}/library/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_module("ordering"))],
)
async def delete_library_item(
    business_id: UUID,
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    deleted = await menu_service.delete_library_item(db, item_id, business_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library item not found")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/api/ordering/{business_id}/items/{item_id}/save-to-library",
    response_model=LibraryItemResponse,
    dependencies=[Depends(require_module("ordering"))],
)
async def save_item_to_library(
    business_id: UUID,
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    lib_item = await menu_service.save_item_to_library(db, item_id, business_id)
    if lib_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.commit()
    return lib_item


@router.post(
    "/api/ordering/{business_id}/library/{item_id}/add-to-category/{category_id}",
    response_model=MenuItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module("ordering"))],
)
async def add_library_item_to_category(
    business_id: UUID,
    item_id: UUID,
    category_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    menu_item = await menu_service.add_library_item_to_category(
        db, item_id, category_id, business_id
    )
    if menu_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library item or category not found",
        )
    await db.commit()
    return menu_item
