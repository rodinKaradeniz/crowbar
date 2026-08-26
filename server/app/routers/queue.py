import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import api_error
from app.core.public_access import has_required_privacy_contact
from app.core.events import DomainEvent, publish
from app.core.rate_limit import (
    PUBLIC_IDENTITY_WRITE_LIMIT,
    PUBLIC_WRITE_IP_LIMIT,
    RateLimitCheck,
    enforce_public_read_limit,
    enforce_rate_limits,
    get_client_ip,
)
from app.core.regional import RegionalValidationError, normalize_phone
from app.database import get_db
from app.dependencies import require_capability, get_current_business, get_current_user, require_module
from app.models.business import Business
from app.models.user import User
from app.schemas.queue_entry import (
    QueueEntryResponse,
    QueueJoinRequest,
    PublicQueueStatusResponse,
    PublicQueueServiceDayResponse,
    QueueRemovalRequest,
    QueueServiceDayResponse,
    QueueServiceDayUpdate,
    QueueStatusResponse,
)
from app.services import notification_service, queue_service
from app.services.public_session_service import (
    clear_public_cookie,
    get_public_cookie,
    set_public_cookie,
)
from app.services.queue_ws_manager import manager
from app.services.websocket_auth import authorize_staff_websocket

logger = logging.getLogger(__name__)
router = APIRouter(tags=["queue"])


def _queue_error(exc: queue_service.QueuePolicyError):
    return api_error(exc.status_code, exc.code, exc.message)


async def _load_business_or_404(db: AsyncSession, business_id: UUID) -> Business:
    business = await db.scalar(select(Business).where(Business.id == business_id))
    if (
        business is None
        or "queue" not in (business.enabled_modules or [])
        or not has_required_privacy_contact(business)
    ):
        raise api_error(404, "NOT_FOUND", "Business not found")
    return business


async def _entry_response(db: AsyncSession, entry, position: int | None = None):
    return QueueEntryResponse(**(await queue_service.entry_to_dict(db, entry, position)))


@router.get(
    "/api/queue/{business_id}/service",
    response_model=PublicQueueServiceDayResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_public_queue_service(
    business_id: UUID, db: AsyncSession = Depends(get_db)
):
    await _load_business_or_404(db, business_id)
    try:
        state = await queue_service.get_service_day(db, business_id)
    except queue_service.QueuePolicyError as exc:
        raise _queue_error(exc) from exc
    return PublicQueueServiceDayResponse(**queue_service.service_day_to_dict(state))


@router.post(
    "/api/queue/{business_id}/join",
    response_model=PublicQueueStatusResponse,
    status_code=status.HTTP_201_CREATED,
)
async def join_queue(
    business_id: UUID,
    body: QueueJoinRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    client_ip = get_client_ip(request)
    checks = [
        RateLimitCheck(
            policy=PUBLIC_WRITE_IP_LIMIT,
            key_parts=("queue_join", str(business_id), client_ip),
        )
    ]
    if body.phone:
        checks.append(
            RateLimitCheck(
                policy=PUBLIC_IDENTITY_WRITE_LIMIT,
                key_parts=("queue_join", str(business_id), body.phone.strip()),
            )
        )
    await enforce_rate_limits(*checks)
    business = await _load_business_or_404(db, business_id)
    try:
        phone = normalize_phone(body.phone, business.country_code)
        state, created = await queue_service.join_queue(
            db,
            business_id,
            body.name,
            body.party_size,
            phone,
            body.idempotency_key,
            channel="web",
        )
    except RegionalValidationError as exc:
        raise api_error(422, "VALIDATION_ERROR", str(exc)) from exc
    except queue_service.QueuePolicyError as exc:
        raise _queue_error(exc) from exc

    raw_session_token = state.pop("_public_session_token", None)
    if created:
        await notification_service.notify_business_staff(
            db,
            business_id=business_id,
            kind="queue_join",
            title=f"{body.name} joined the queue",
            body=f"Party of {body.party_size} is waiting.",
            payload={"entry_id": str(state["entry"]["id"])},
        )
    await db.commit()
    if raw_session_token is not None:
        set_public_cookie(response, kind="queue", token=raw_session_token)
    if created:
        await publish(
            DomainEvent(
                event_type="queue.party_joined",
                business_id=str(business_id),
                payload={"entry_id": str(state["entry"]["id"]), "party_size": body.party_size},
            )
        )
    else:
        response.status_code = status.HTTP_200_OK
    return PublicQueueStatusResponse(**state)


@router.post("/api/queue/{business_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_queue(
    business_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _load_business_or_404(db, business_id)
    session_token = get_public_cookie(request, kind="queue")
    if session_token is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    await enforce_rate_limits(
        RateLimitCheck(
            policy=PUBLIC_WRITE_IP_LIMIT,
            key_parts=("queue_leave", str(business_id), get_client_ip(request)),
        ),
        RateLimitCheck(
            policy=PUBLIC_IDENTITY_WRITE_LIMIT,
            key_parts=("queue_leave", str(business_id), session_token),
        ),
    )
    entry = await queue_service.remove_by_token(db, business_id, session_token)
    if entry is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    await notification_service.notify_business_staff(
        db,
        business_id=business_id,
        kind="queue_leave",
        title=f"{entry.name} left the queue",
        body=f"Party of {entry.party_size} left the queue.",
        payload={"entry_id": str(entry.id)},
    )
    await db.commit()
    await publish(
        DomainEvent(
            event_type="queue.party_removed",
            business_id=str(business_id),
            payload={"entry_id": str(entry.id), "reason_code": "guest_left"},
        )
    )
    clear_public_cookie(response := Response(status_code=status.HTTP_204_NO_CONTENT), kind="queue")
    return response


@router.get(
    "/api/queue/{business_id}/status",
    response_model=PublicQueueStatusResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_queue_status(
    business_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _load_business_or_404(db, business_id)
    session_token = get_public_cookie(request, kind="queue")
    if session_token is None:
        raise api_error(404, "NOT_FOUND", "Queue entry not found")
    state = await queue_service.get_status_by_token(db, business_id, session_token)
    if state is None:
        raise api_error(404, "NOT_FOUND", "Queue entry not found")
    return PublicQueueStatusResponse(**state)


@router.get(
    "/api/queue/service-day",
    response_model=QueueServiceDayResponse,
    dependencies=[Depends(require_module("queue")), Depends(require_capability("queue.view"))],
)
async def get_staff_queue_service_day(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    try:
        state = await queue_service.get_service_day(db, business.id)
    except queue_service.QueuePolicyError as exc:
        raise _queue_error(exc) from exc
    return QueueServiceDayResponse(**queue_service.service_day_to_dict(state))


@router.put(
    "/api/queue/service-day",
    response_model=QueueServiceDayResponse,
    dependencies=[Depends(require_module("queue")), Depends(require_capability("queue.configure"))],
)
async def update_staff_queue_service_day(
    body: QueueServiceDayUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    try:
        _, changed = await queue_service.set_service_day(
            db,
            business.id,
            status=body.status,
            max_waiting_covers=body.max_waiting_covers,
            actor_id=current_user.id,
        )
        state = await queue_service.get_service_day(db, business.id)
    except queue_service.QueuePolicyError as exc:
        raise _queue_error(exc) from exc
    await db.commit()
    if changed:
        await publish(
            DomainEvent(
                event_type=f"queue.service_{'opened' if body.status == 'open' else 'closed'}",
                business_id=str(business.id),
                payload={"service_date": str(state["service_date"])},
                location_id=str(state["location"].id),
            )
        )
    return QueueServiceDayResponse(**queue_service.service_day_to_dict(state))


@router.get(
    "/api/queue/entries",
    response_model=list[QueueEntryResponse],
    dependencies=[Depends(require_module("queue")), Depends(require_capability("queue.view"))],
)
@router.get(
    "/api/queue/{business_id}/entries",
    response_model=list[QueueEntryResponse],
    dependencies=[Depends(require_module("queue")), Depends(require_capability("queue.view"))],
    include_in_schema=False,
)
async def list_queue_entries(
    business_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    if business_id is not None and business_id != business.id:
        raise api_error(404, "NOT_FOUND", "Queue not found")
    entries = await queue_service.get_active_entries(db, business.id)
    waiting_position = 1
    result = []
    for entry in entries:
        position = waiting_position if entry.status == "waiting" else None
        if entry.status == "waiting":
            waiting_position += 1
        result.append(await _entry_response(db, entry, position))
    return result


@router.post(
    "/api/queue/entries",
    response_model=QueueStatusResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_module("queue")), Depends(require_capability("queue.manage"))],
)
async def create_staff_walk_in(
    body: QueueJoinRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    try:
        phone = normalize_phone(body.phone, business.country_code)
        state, created = await queue_service.join_queue(
            db,
            business.id,
            body.name,
            body.party_size,
            phone,
            body.idempotency_key,
            actor_id=current_user.id,
            channel="staff",
        )
        state.pop("_public_session_token", None)
    except RegionalValidationError as exc:
        raise api_error(422, "VALIDATION_ERROR", str(exc)) from exc
    except queue_service.QueuePolicyError as exc:
        raise _queue_error(exc) from exc
    await db.commit()
    if created:
        await publish(
            DomainEvent(
                event_type="queue.party_joined",
                business_id=str(business.id),
                payload={"entry_id": str(state["entry"]["id"]), "source": "staff"},
            )
        )
    else:
        response.status_code = status.HTTP_200_OK
    return QueueStatusResponse(**state)


@router.post(
    "/api/queue/entries/{entry_id}/call",
    response_model=QueueEntryResponse,
    dependencies=[Depends(require_module("queue")), Depends(require_capability("queue.manage"))],
)
@router.post(
    "/api/queue/{business_id}/entries/{entry_id}/notify",
    response_model=QueueEntryResponse,
    dependencies=[Depends(require_module("queue")), Depends(require_capability("queue.manage"))],
    include_in_schema=False,
)
async def call_queue_entry(
    entry_id: UUID,
    business_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business_id is not None and business_id != business.id:
        raise api_error(404, "NOT_FOUND", "Queue entry not found")
    entry = await queue_service.call_entry(db, business.id, entry_id, current_user.id)
    if entry is None:
        raise api_error(404, "NOT_FOUND", "Queue entry not found or not waiting")
    await notification_service.notify_business_staff(
        db,
        business_id=business.id,
        kind="queue_called",
        title=f"{entry.name} was called",
        body="The party is marked called. Delivery status is tracked separately.",
        payload={"entry_id": str(entry.id)},
        exclude_user_id=current_user.id,
    )
    await db.commit()
    await publish(
        DomainEvent(
            event_type="queue.party_called",
            business_id=str(business.id),
            payload={"entry_id": str(entry.id)},
        )
    )
    attempt = await queue_service.deliver_queue_call(db, business.id, entry.id)
    if attempt is not None:
        await db.commit()
        await publish(
            DomainEvent(
                event_type="queue.delivery_updated",
                business_id=str(business.id),
                payload={"entry_id": str(entry.id), "state": attempt.status},
            )
        )
    return await _entry_response(db, entry)


@router.post(
    "/api/queue/entries/{entry_id}/delivery/retry",
    response_model=QueueEntryResponse,
    dependencies=[Depends(require_module("queue")), Depends(require_capability("queue.manage"))],
)
async def retry_queue_delivery(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    attempt = await queue_service.deliver_queue_call(db, business.id, entry_id)
    if attempt is None:
        raise api_error(409, "DELIVERY_UNAVAILABLE", "No configured delivery channel is available")
    await db.commit()
    await publish(
        DomainEvent(
            event_type="queue.delivery_updated",
            business_id=str(business.id),
            payload={"entry_id": str(entry_id), "state": attempt.status},
        )
    )
    entry = await db.scalar(
        select(queue_service.QueueEntry).where(
            queue_service.QueueEntry.id == entry_id,
            queue_service.QueueEntry.business_id == business.id,
        )
    )
    return await _entry_response(db, entry)


@router.post(
    "/api/queue/entries/{entry_id}/remove",
    response_model=QueueEntryResponse,
    dependencies=[Depends(require_module("queue")), Depends(require_capability("queue.manage"))],
)
async def remove_queue_entry(
    entry_id: UUID,
    body: QueueRemovalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    entry = await queue_service.remove_entry(
        db,
        business.id,
        entry_id,
        actor_id=current_user.id,
        reason_code=body.reason_code,
        note=body.note,
    )
    if entry is None:
        raise api_error(404, "NOT_FOUND", "Queue entry not found or already inactive")
    await db.commit()
    await publish(
        DomainEvent(
            event_type="queue.party_removed",
            business_id=str(business.id),
            payload={"entry_id": str(entry.id), "reason_code": body.reason_code},
        )
    )
    return await _entry_response(db, entry)


@router.websocket("/ws/queue/{business_id}")
async def queue_websocket(
    business_id: UUID,
    ws: WebSocket,
    db: AsyncSession = Depends(get_db),
):
    if not await authorize_staff_websocket(
        db, ws, business_id=business_id, required_modules=("queue",)
    ):
        return
    bid = str(business_id)
    await manager.connect(bid, ws)
    entries = await queue_service.get_active_entries(db, business_id)
    waiting_position = 1
    payload = []
    for entry in entries:
        position = waiting_position if entry.status == "waiting" else None
        if entry.status == "waiting":
            waiting_position += 1
        payload.append(await queue_service.entry_to_dict(db, entry, position))
    try:
        await ws.send_json({"type": "queue_updated", "entries": payload})
        async for _ in ws.iter_text():
            pass
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(bid, ws)
