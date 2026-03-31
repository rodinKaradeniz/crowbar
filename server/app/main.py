import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.core.errors import http_exception_handler, validation_exception_handler
from app.routers import (
    analytics,
    auth,
    businesses,
    customers,
    inventory,
    notifications,
    ordering,
    queue,
    reservations,
    service_types,
    staff,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("slotera")


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Slotera API",
    description="Reservation management system API",
    version="0.1.0",
    lifespan=lifespan,
)

# ─── Error handlers ───────────────────────────────────────────────────────────

app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)

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
app.include_router(businesses.router)
app.include_router(service_types.router)
app.include_router(reservations.router)
app.include_router(notifications.router)
app.include_router(customers.router)
app.include_router(staff.router)
app.include_router(analytics.router)
app.include_router(queue.router)
app.include_router(ordering.router)
app.include_router(inventory.router)

# ─── Static files (dev only) ──────────────────────────────────────────────────

if settings.environment == "development":
    import os

    os.makedirs(settings.upload_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "environment": settings.environment}
