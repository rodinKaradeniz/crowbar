import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.errors import http_exception_handler, validation_exception_handler
from app.core.events import STREAM_KEY
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
    notifications,
    ordering,
    queue,
    reservations,
    service_types,
    staff,
    tabs,
)
from app.routers.floor_plan import floor_plan_error_handler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("crowbar")


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
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
        user_id or "-",
        business_id or "-",
    )
    response.headers["X-Request-ID"] = request_id
    return response

# ─── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
app.include_router(staff.router)
app.include_router(analytics.router)
app.include_router(queue.router)
app.include_router(ordering.router)
app.include_router(inventory.router)
app.include_router(tabs.router)
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
        "database": "connected",
        "environment": settings.environment,
    }
