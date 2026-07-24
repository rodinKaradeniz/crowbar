"""
ML Insights Microservice

FastAPI application providing endpoints to trigger ML pipelines,
view results, and check service health.
"""

import logging
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Response, status

from src.config import settings
from src.db import check_db_connection
from src.pipelines.insights_pipeline import InsightsPipeline

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# In-memory stores are tenant-keyed so one business can never read another
# business's latest run. Durable predictions remain in PostgreSQL.
_latest_results: dict[str, dict] = {}
_pipeline_history: dict[str, list[dict]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("ML Insights service starting up...")
    db_ok = await check_db_connection()
    if db_ok:
        logger.info("Database connection verified")
    else:
        logger.error("Database connection FAILED — pipeline will not work")
    yield
    logger.info("ML Insights service shutting down...")


app = FastAPI(
    title="Crowbar — ML Insights",
    description=(
        "Machine learning insights microservice for the Crowbar platform. "
        "Provides customer segmentation, cancellation prediction, and demand forecasting."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ── Health & Status ──


@app.get("/health")
async def health_check(response: Response):
    """Service health check."""
    db_ok = await check_db_connection()
    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ok" if db_ok else "degraded",
        "service": "ml-insights",
        "database": "connected" if db_ok else "disconnected",
        "environment": settings.environment,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def require_internal_token(
    token: str | None = Header(default=None, alias="X-ML-Internal-Token"),
) -> None:
    """Allow only the trusted API gateway to call tenant-scoped ML routes."""
    expected = settings.ml_internal_token
    if expected is None:
        if settings.environment == "development":
            return
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ML internal authentication is not configured",
        )

    if token is None or not secrets.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal service credentials",
        )


business_router = APIRouter(
    prefix="/businesses/{business_id}",
    dependencies=[Depends(require_internal_token)],
)


@business_router.get("/status")
async def pipeline_status(business_id: UUID):
    """Get the status of the latest pipeline run."""
    business_key = str(business_id)
    latest = _latest_results.get(business_key)
    if not latest:
        return {
            "status": "no_runs",
            "message": "No pipeline has been executed yet. POST /pipeline/run to start one.",
        }

    return {
        "status": "ok",
        "latest_run": {
            "run_id": latest.get("run_id"),
            "timestamp": latest.get("timestamp"),
            "elapsed_seconds": latest.get("elapsed_seconds"),
            "data_summary": latest.get("data"),
        },
        "total_runs": len(_pipeline_history.get(business_key, [])),
    }


# ── Pipeline Execution ──


@business_router.post("/pipeline/run")
async def run_pipeline(business_id: UUID, store_results: bool = True):
    """
    Trigger a full ML insights pipeline run.

    This will:
    1. Load this business's reservation and customer data from the database
    2. Engineer features (RFM, temporal, behavioral)
    3. Train models (segmentation, cancellation, demand forecast)
    4. Optionally store predictions in the database

    Args:
        store_results: Whether to persist predictions to the DB (default: True)
    """
    business_key = str(business_id)
    logger.info("Pipeline run triggered for business %s", business_key)

    try:
        pipeline = InsightsPipeline(business_id=business_key)
        results = pipeline.run(store_results=store_results)

        _latest_results[business_key] = results
        _pipeline_history.setdefault(business_key, []).append(
            {
                "run_id": results.get("run_id"),
                "timestamp": results.get("timestamp"),
                "elapsed_seconds": results.get("elapsed_seconds"),
            }
        )

        return results

    except Exception as e:
        logger.error(f"Pipeline execution failed: {e}")
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {str(e)}")


# ── Results Endpoints ──


def _get_latest_results(business_id: UUID) -> dict:
    latest = _latest_results.get(str(business_id))
    if latest is None:
        raise HTTPException(
            status_code=404, detail="No pipeline results. Run the pipeline first."
        )
    return latest


@business_router.get("/results/segmentation")
async def get_segmentation_results(business_id: UUID):
    """Get the latest customer segmentation results."""
    segmentation = _get_latest_results(business_id).get("segmentation", {})
    if segmentation.get("status") != "success":
        raise HTTPException(
            status_code=404,
            detail=f"Segmentation not available: {segmentation.get('reason', segmentation.get('error', 'unknown'))}",
        )

    return segmentation


@business_router.get("/results/cancellation")
async def get_cancellation_results(business_id: UUID):
    """Get the latest cancellation prediction model results."""
    cancellation = _get_latest_results(business_id).get("cancellation", {})
    if cancellation.get("status") != "success":
        raise HTTPException(
            status_code=404,
            detail=f"Cancellation model not available: {cancellation.get('reason', cancellation.get('error', 'unknown'))}",
        )

    return cancellation


@business_router.get("/results/demand")
async def get_demand_forecast_results(business_id: UUID):
    """Get the latest demand forecast results."""
    demand = _get_latest_results(business_id).get("demand_forecast", {})
    if demand.get("status") != "success":
        raise HTTPException(
            status_code=404,
            detail=f"Demand forecast not available: {demand.get('reason', demand.get('error', 'unknown'))}",
        )

    return demand


@business_router.get("/results/summary")
async def get_results_summary(business_id: UUID):
    """Get a high-level summary of all latest results."""
    latest = _get_latest_results(business_id)

    summary = {
        "run_id": latest.get("run_id"),
        "timestamp": latest.get("timestamp"),
        "elapsed_seconds": latest.get("elapsed_seconds"),
        "data": latest.get("data"),
        "models": {},
    }

    for model_key in ["segmentation", "cancellation", "demand_forecast"]:
        model_data = latest.get(model_key, {})
        summary["models"][model_key] = {
            "status": model_data.get("status", "not_run"),
        }

        # Add key metrics per model
        if model_key == "segmentation" and model_data.get("status") == "success":
            summary["models"][model_key]["n_customers"] = model_data.get("n_customers")
            summary["models"][model_key]["segments"] = model_data.get("segments")

        elif model_key == "cancellation" and model_data.get("status") == "success":
            summary["models"][model_key]["metrics"] = model_data.get("metrics")

        elif model_key == "demand_forecast" and model_data.get("status") == "success":
            summary["models"][model_key]["businesses_modeled"] = len(
                model_data.get("metrics", {})
            )

    return summary

@business_router.get("/history")
async def get_pipeline_history(business_id: UUID):
    """Get this business's pipeline runs from the current service session."""
    runs = _pipeline_history.get(str(business_id), [])
    return {
        "total_runs": len(runs),
        "runs": list(reversed(runs)),
    }


app.include_router(business_router)
