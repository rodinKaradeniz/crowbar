from typing import Any

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.errors import ErrorCode, api_error
from app.database import get_db
from app.dependencies import get_current_business, require_capability, require_module
from app.models.business import Business
from app.services import ml_snapshot_service

router = APIRouter(
    prefix="/api/insights",
    tags=["insights"],
    dependencies=[Depends(require_module("insights"))],
)


class MLUnavailable(Exception):
    """The ML service could not be reached at all.

    Distinct from an error *response*: a 4xx or 5xx from a reachable service is
    a real answer and is passed through, while an unreachable service is a
    degradation the dashboard can survive by showing what it remembers.
    """


async def _request_ml(
    method: str,
    business_id: str,
    path: str,
    *,
    timeout_seconds: float = 15,
) -> Any:
    headers: dict[str, str] = {}
    if settings.ml_internal_token:
        headers["X-ML-Internal-Token"] = settings.ml_internal_token

    url = (
        f"{settings.ml_service_url.rstrip('/')}"
        f"/businesses/{business_id}/{path.lstrip('/')}"
    )

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.request(method, url, headers=headers)
    except httpx.RequestError as exc:
        raise MLUnavailable(str(exc)) from exc

    if response.is_error:
        try:
            body = response.json()
            message = body.get("detail") or body.get("message")
        except (ValueError, AttributeError):
            message = None

        raise api_error(
            response.status_code,
            ErrorCode.INTERNAL_ERROR,
            str(message or "Insights service request failed"),
        )

    return response.json()


async def _read(
    db: AsyncSession,
    business: Business,
    resource: str,
    path: str,
) -> Any:
    """Fetch one dashboard resource, remembering it or falling back to memory.

    ML is optional and must never block or corrupt the operational record, so an
    unreachable service degrades this page rather than erroring it. The caller
    always gets a body; `stale` says whether it is live.
    """
    try:
        payload = await _request_ml("GET", str(business.id), path)
    except MLUnavailable:
        snapshot = await ml_snapshot_service.latest(db, business.id, resource)
        if snapshot is None:
            return ml_snapshot_service.as_empty_response(resource)
        return ml_snapshot_service.as_stale_response(snapshot)

    # Snapshotting is best-effort: failing to remember a result must not turn a
    # successful read into an error.
    try:
        await ml_snapshot_service.record(db, business.id, resource, payload)
    except Exception:  # noqa: BLE001 - the live answer is still correct
        await db.rollback()

    if isinstance(payload, dict):
        return {**payload, "stale": False}
    return payload


@router.get(
    "/status",
    dependencies=[Depends(require_capability("insights.view"))],
)
async def get_pipeline_status(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    return await _read(db, business, "status", "status")


@router.get(
    "/segmentation",
    dependencies=[Depends(require_capability("insights.view"))],
)
async def get_segmentation(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    return await _read(db, business, "segmentation", "results/segmentation")


@router.get(
    "/cancellation",
    dependencies=[Depends(require_capability("insights.view"))],
)
async def get_cancellation(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    return await _read(db, business, "cancellation", "results/cancellation")


@router.get(
    "/demand",
    dependencies=[Depends(require_capability("insights.view"))],
)
async def get_demand(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    return await _read(db, business, "demand", "results/demand")


@router.post(
    "/run",
    dependencies=[Depends(require_capability("insights.run"))],
)
async def run_pipeline(
    business: Business = Depends(get_current_business),
):
    """Trigger a pipeline run.

    Unlike the reads, this has no useful degraded form — there is nothing to
    remember about a run that never started — so an unreachable service is a
    503 the operator can act on by retrying.
    """
    try:
        return await _request_ml(
            "POST",
            str(business.id),
            "pipeline/run?store_results=true",
            timeout_seconds=300,
        )
    except MLUnavailable as exc:
        raise api_error(
            503,
            ErrorCode.INTERNAL_ERROR,
            "Insights service is unavailable",
        ) from exc
