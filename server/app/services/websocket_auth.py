import asyncio
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.business import Business
from app.models.staff import Staff
from app.models.user import User


async def authorize_staff_websocket(
    db: AsyncSession,
    ws: WebSocket,
    *,
    business_id: UUID,
    required_modules: tuple[str, ...],
) -> bool:
    """Accept a socket, then validate its first authentication frame."""
    await ws.accept()
    try:
        message = await asyncio.wait_for(ws.receive_json(), timeout=5)
        token = (
            message.get("token")
            if isinstance(message, dict) and message.get("type") == "authenticate"
            else None
        )
        if not isinstance(token, str):
            await ws.close(code=1008)
            return False
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            audience="crowbar-staff-websocket",
        )
        user_id = payload.get("sub")
        token_business_id = payload.get("business_id")
        session_version = payload.get("session_version")
        if (
            payload.get("token_use") != "websocket"
            or user_id is None
            or token_business_id != str(business_id)
        ):
            await ws.close(code=1008)
            return False
    except (jwt.InvalidTokenError, asyncio.TimeoutError, ValueError, WebSocketDisconnect):
        await ws.close(code=1008)
        return False

    user = await db.scalar(
        select(User).where(
            User.id == user_id,
            User.is_active.is_(True),
            User.session_version == session_version,
        )
    )
    if user is None:
        await ws.close(code=1008)
        return False

    staff = await db.scalar(
        select(Staff.id).where(
            Staff.user_id == user_id,
            Staff.business_id == business_id,
        )
    )
    if staff is None:
        await ws.close(code=1008)
        return False

    business = await db.scalar(select(Business).where(Business.id == business_id))
    enabled = set(business.enabled_modules or []) if business else set()
    if not enabled.intersection(required_modules):
        await ws.close(code=1008)
        return False
    await ws.send_json({"type": "authenticated"})
    return True
