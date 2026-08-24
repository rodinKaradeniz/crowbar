import asyncio
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

import redis.asyncio as aioredis
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.errors import http_exception_handler, validation_exception_handler
from app.core.events import STREAM_KEY
from app.core.log_redaction import install_log_redaction
from app.core.redis_client import close_redis, get_redis
from app.core.stream_consumer import GROUP_NAME, ws_push_consumer
from app.database import get_db
from app.services.floor_plan_service import FloorPlanError
from app.routers import (
    analytics,
    availability,
    auth,
    booking_schedules,
    businesses,
    customers,
    floor_plan,
    happy_hour,
    insights,
    inventory,
    purchasing,
    notifications,
    ordering,
    public_capabilities,
    queue,
    reservations,
    service_types,
    staff,
    tabs,
    tax,
)
from app.routers.floor_plan import floor_plan_error_handler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
install_log_redaction()
logger = logging.getLogger("crowbar")

_MAX_REQUEST_BODY_BYTES = 1_048_576

_CREDENTIAL_PATH_PATTERNS = (
    re.compile(r"(/public/manage/)[^/]+"),
    re.compile(r"(/waitlist/manage/)[^/]+"),
    re.compile(r"(/waitlist/offers/)[^/]+"),
    re.compile(r"(/invite/)[^/]+"),
)


def redact_request_path(path: str) -> str:
    """Remove legacy bearer credentials before a request path reaches logs."""
    redacted = path
    for pattern in _CREDENTIAL_PATH_PATTERNS:
        redacted = pattern.sub(r"\1[redacted]", redacted)
    return redacted


class RequestBodyLimitMiddleware:
    """Bound declared and streamed HTTP bodies before route parsing."""

    def __init__(self, app: Any, max_bytes: int = _MAX_REQUEST_BODY_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", ()))
        content_length = headers.get(b"content-length", b"")
        if content_length.isdigit() and int(content_length) > self.max_bytes:
            await self._reject(scope, receive, send)
            return

        received = 0
        messages = []
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    await self._reject(scope, receive, send)
                    return
                if not message.get("more_body", False):
                    break
            elif message["type"] == "http.disconnect":
                break

        message_index = 0

        async def replay_receive():
            nonlocal message_index
            if message_index < len(messages):
                message = messages[message_index]
                message_index += 1
                return message
            return await receive()

        await self.app(scope, replay_receive, send)

    @staticmethod
    async def _reject(scope, receive, send):
        response = JSONResponse(
            status_code=413,
            content={
                "code": "REQUEST_TOO_LARGE",
                "message": "The request body is too large.",
                "details": None,
            },
        )
        await response(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    r = await get_redis()

    # Create consumer group if it doesn't exist yet (MKSTREAM creates the
    # stream on first use so the server starts cleanly even on a fresh Redis).
    try:
        await r.xgroup_create(STREAM_KEY, GROUP_NAME, id="$", mkstream=True)
        logger.info("lifespan: created consumer group %s on stream %s", GROUP_NAME, STREAM_KEY)
    except aioredis.ResponseError as exc:
        if "BUSYGROUP" in str(exc):
            logger.debug("lifespan: consumer group %s already exists", GROUP_NAME)
        else:
            logger.warning("lifespan: xgroup_create error: %s", exc)

    consumer_task = asyncio.create_task(ws_push_consumer(), name="ws_push_consumer")

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    consumer_task.cancel()
    await asyncio.gather(consumer_task, return_exceptions=True)
    await close_redis()
    logger.info("lifespan: shutdown complete")


app = FastAPI(
    title="Crowbar API",
    description="Reservation management system API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None if settings.environment == "production" else "/docs",
    redoc_url=None if settings.environment == "production" else "/redoc",
    openapi_url=None if settings.environment == "production" else "/openapi.json",
)

# ─── Error handlers ───────────────────────────────────────────────────────────

app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(FloorPlanError, floor_plan_error_handler)

# ─── Structured request logging middleware ────────────────────────────────────

@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id

    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)

    # Extract auth context if available (best-effort; never block the response)
    user_id = getattr(request.state, "user_id", None)
    business_id = getattr(request.state, "business_id", None)

    logger.info(
        "http_request method=%s path=%s status=%s duration_ms=%s request_id=%s user_id=%s business_id=%s",
        request.method,
        redact_request_path(request.url.path),
        response.status_code,
        duration_ms,
        request_id,
        user_id or "-",
        business_id or "-",
    )
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# ─── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestBodyLimitMiddleware)

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(availability.router)
app.include_router(booking_schedules.router)
app.include_router(businesses.router)
app.include_router(service_types.router)
app.include_router(reservations.router)
app.include_router(notifications.router)
app.include_router(customers.router)
app.include_router(floor_plan.router)
app.include_router(floor_plan.ws_router)
app.include_router(staff.router)
app.include_router(analytics.router)
app.include_router(queue.router)
app.include_router(ordering.router)
app.include_router(public_capabilities.router)
app.include_router(inventory.router)
app.include_router(purchasing.router)
app.include_router(tabs.router)
app.include_router(tabs.ws_router)
app.include_router(tax.router)
app.include_router(happy_hour.router)
app.include_router(insights.router)

# ─── Static files (dev only) ──────────────────────────────────────────────────

if settings.environment == "development":
    import os

    os.makedirs(settings.upload_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/api/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "service": "api",
    }
