from typing import Any

import httpx
from fastapi import APIRouter, Depends

from app.config import settings
from app.core.errors import ErrorCode, api_error
from app.dependencies import get_current_business, require_module
from app.models.business import Business

router = APIRouter(
    prefix="/api/insights",
    tags=["insights"],
    dependencies=[Depends(require_module("insights"))],
)


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
        raise api_error(
            503,
            ErrorCode.INTERNAL_ERROR,
            "Insights service is unavailable",
        ) from exc

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


@router.get("/status")
async def get_pipeline_status(
    business: Business = Depends(get_current_business),
):
    return await _request_ml("GET", str(business.id), "status")


@router.get("/segmentation")
async def get_segmentation(
    business: Business = Depends(get_current_business),
):
    return await _request_ml("GET", str(business.id), "results/segmentation")


@router.get("/cancellation")
async def get_cancellation(
    business: Business = Depends(get_current_business),
):
    return await _request_ml("GET", str(business.id), "results/cancellation")


@router.get("/demand")
async def get_demand(
    business: Business = Depends(get_current_business),
):
    return await _request_ml("GET", str(business.id), "results/demand")


@router.post("/run")
async def run_pipeline(
    business: Business = Depends(get_current_business),
):
    return await _request_ml(
        "POST",
        str(business.id),
        "pipeline/run?store_results=true",
        timeout_seconds=300,
    )
