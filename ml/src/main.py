"""
ML Insights Microservice

FastAPI application providing endpoints to trigger ML pipelines,
view results, and check service health.
"""

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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

# In-memory store for the latest pipeline results
_latest_results: dict = {}
_pipeline_history: list[dict] = []


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
    title="RK Reservations — ML Insights",
    description=(
        "Machine learning insights microservice for the RK Reservations platform. "
        "Provides customer segmentation, cancellation prediction, and demand forecasting."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health & Status ──


@app.get("/health")
async def health_check():
    """Service health check."""
    db_ok = await check_db_connection()
    return {
        "status": "ok" if db_ok else "degraded",
        "service": "ml-insights",
        "database": "connected" if db_ok else "disconnected",
        "environment": settings.environment,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/status")
async def pipeline_status():
    """Get the status of the latest pipeline run."""
    if not _latest_results:
        return {
            "status": "no_runs",
            "message": "No pipeline has been executed yet. POST /pipeline/run to start one.",
        }

    return {
        "status": "ok",
        "latest_run": {
            "run_id": _latest_results.get("run_id"),
            "timestamp": _latest_results.get("timestamp"),
            "elapsed_seconds": _latest_results.get("elapsed_seconds"),
            "data_summary": _latest_results.get("data"),
        },
        "total_runs": len(_pipeline_history),
    }


# ── Pipeline Execution ──


@app.post("/pipeline/run")
async def run_pipeline(store_results: bool = True):
    """
    Trigger a full ML insights pipeline run.

    This will:
    1. Load all reservation and customer data from the database
    2. Engineer features (RFM, temporal, behavioral)
    3. Train models (segmentation, cancellation, demand forecast)
    4. Optionally store predictions in the database

    Args:
        store_results: Whether to persist predictions to the DB (default: True)
    """
    global _latest_results

    logger.info("Pipeline run triggered via API")

    try:
        pipeline = InsightsPipeline()
        results = pipeline.run(store_results=store_results)

        _latest_results = results
        _pipeline_history.append(
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


@app.get("/results/segmentation")
async def get_segmentation_results():
    """Get the latest customer segmentation results."""
    if not _latest_results:
        raise HTTPException(
            status_code=404, detail="No pipeline results. Run the pipeline first."
        )

    segmentation = _latest_results.get("segmentation", {})
    if segmentation.get("status") != "success":
        raise HTTPException(
            status_code=404,
            detail=f"Segmentation not available: {segmentation.get('reason', segmentation.get('error', 'unknown'))}",
        )

    return segmentation


@app.get("/results/cancellation")
async def get_cancellation_results():
    """Get the latest cancellation prediction model results."""
    if not _latest_results:
        raise HTTPException(
            status_code=404, detail="No pipeline results. Run the pipeline first."
        )

    cancellation = _latest_results.get("cancellation", {})
    if cancellation.get("status") != "success":
        raise HTTPException(
            status_code=404,
            detail=f"Cancellation model not available: {cancellation.get('reason', cancellation.get('error', 'unknown'))}",
        )

    return cancellation


@app.get("/results/demand")
async def get_demand_forecast_results():
    """Get the latest demand forecast results."""
    if not _latest_results:
        raise HTTPException(
            status_code=404, detail="No pipeline results. Run the pipeline first."
        )

    demand = _latest_results.get("demand_forecast", {})
    if demand.get("status") != "success":
        raise HTTPException(
            status_code=404,
            detail=f"Demand forecast not available: {demand.get('reason', demand.get('error', 'unknown'))}",
        )

    return demand


@app.get("/results/summary")
async def get_results_summary():
    """Get a high-level summary of all latest results."""
    if not _latest_results:
        raise HTTPException(
            status_code=404, detail="No pipeline results. Run the pipeline first."
        )

    summary = {
        "run_id": _latest_results.get("run_id"),
        "timestamp": _latest_results.get("timestamp"),
        "elapsed_seconds": _latest_results.get("elapsed_seconds"),
        "data": _latest_results.get("data"),
        "models": {},
    }

    for model_key in ["segmentation", "cancellation", "demand_forecast"]:
        model_data = _latest_results.get(model_key, {})
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


@app.get("/history")
async def get_pipeline_history():
    """Get a list of all pipeline runs in this session."""
    return {
        "total_runs": len(_pipeline_history),
        "runs": list(reversed(_pipeline_history)),
    }
