"""
ML Insights Pipeline

Orchestrates the full ETL → Feature Engineering → Model Training → Storage flow.

Can be triggered manually via the API or scheduled via cron.
Each pipeline run:
    1. Loads raw data from the app database
    2. Engineers features (reservation-level, customer-level, daily demand)
    3. Trains/evaluates models (segmentation, cancellation, demand)
    4. Stores predictions and metrics back to the database
"""

import json
import logging
import uuid
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import text

from src.db import load_customers, load_reservations, sync_engine
from src.features.customer_features import (
    build_customer_features,
    build_rfm_features,
)
from src.features.reservation_features import (
    build_daily_demand,
    build_demand_timeseries_features,
    build_reservation_features,
)
from src.models.cancellation import CancellationPredictionModel
from src.models.demand_forecast import DemandForecastModel
from src.models.segmentation import CustomerSegmentationModel

logger = logging.getLogger(__name__)


class InsightsPipeline:
    """
    Main ML pipeline that orchestrates all insight generation.

    Usage:
        pipeline = InsightsPipeline(business_id="...")
        results = pipeline.run()
    """

    def __init__(self, business_id: str):
        if not business_id:
            raise ValueError("business_id is required")
        self.business_id = business_id
        self.run_id = str(uuid.uuid4())[:8]
        self.run_timestamp = datetime.now(timezone.utc)
        self.results: dict = {}

    def run(self, store_results: bool = True) -> dict:
        """
        Execute the full insights pipeline.

        Args:
            store_results: Whether to write predictions to the DB

        Returns:
            Dictionary with results from each model
        """
        logger.info(f"=== Pipeline run {self.run_id} started ===")
        start_time = datetime.now(timezone.utc)

        # ── Step 1: Load raw data ──
        logger.info("Step 1: Loading data from database...")
        reservations_raw = load_reservations(self.business_id)
        customers_raw = load_customers(self.business_id)

        if reservations_raw.empty:
            logger.warning("No reservations found — aborting pipeline")
            return {"error": "No reservation data available", "run_id": self.run_id}

        logger.info(
            f"  Loaded {len(reservations_raw)} reservations, "
            f"{len(customers_raw)} customers"
        )

        # ── Step 2: Feature engineering ──
        logger.info("Step 2: Engineering features...")

        reservation_features = build_reservation_features(reservations_raw)
        customer_features = build_customer_features(reservations_raw, customers_raw)
        rfm = build_rfm_features(customer_features)
        daily_demand = build_daily_demand(reservation_features)
        demand_ts = build_demand_timeseries_features(daily_demand)

        logger.info(
            f"  Features built — {len(reservation_features)} reservations, "
            f"{len(customer_features)} customers, "
            f"{len(daily_demand)} daily records"
        )

        # ── Step 3: Customer Segmentation ──
        logger.info("Step 3: Running customer segmentation...")
        segmentation_result = self._run_segmentation(rfm)

        # ── Step 4: Cancellation Prediction ──
        logger.info("Step 4: Training cancellation model...")
        cancellation_result = self._run_cancellation(
            reservation_features, customer_features
        )

        # ── Step 5: Demand Forecasting ──
        logger.info("Step 5: Training demand forecast...")
        demand_result = self._run_demand_forecast(demand_ts)

        # ── Step 6: Store results ──
        if store_results:
            logger.info("Step 6: Storing predictions...")
            self._store_results(
                segmentation_result,
                cancellation_result,
                demand_result,
                daily_demand,
            )

        # ── Summary ──
        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
        self.results = {
            "run_id": self.run_id,
            "timestamp": self.run_timestamp.isoformat(),
            "elapsed_seconds": round(elapsed, 2),
            "data": {
                "business_id": self.business_id,
                "reservations": len(reservations_raw),
                "customers": len(customers_raw),
            },
            "segmentation": segmentation_result,
            "cancellation": cancellation_result,
            "demand_forecast": demand_result,
        }

        logger.info(
            f"=== Pipeline run {self.run_id} completed in {elapsed:.1f}s ==="
        )
        return self.results

    def _run_segmentation(self, rfm: pd.DataFrame) -> dict:
        """Run customer segmentation and return summary."""
        if rfm.empty or len(rfm) < 2:
            return {"status": "skipped", "reason": "Not enough customers with bookings"}

        try:
            model = CustomerSegmentationModel(
                n_clusters=min(4, len(rfm))
            )
            segments = model.fit_predict(rfm)
            summary = model.get_summary()

            segment_counts = segments["segment_label"].value_counts().to_dict()

            return {
                "status": "success",
                "n_customers": len(segments),
                "segments": segment_counts,
                "model_summary": summary,
                "customer_segments": segments[
                    ["customer_id", "recency", "frequency", "monetary", "segment_label"]
                ].to_dict(orient="records"),
            }
        except Exception as e:
            logger.error(f"Segmentation failed: {e}")
            return {"status": "error", "error": str(e)}

    def _run_cancellation(
        self,
        reservation_features: pd.DataFrame,
        customer_features: pd.DataFrame,
    ) -> dict:
        """Train cancellation model and return metrics + predictions."""
        try:
            model = CancellationPredictionModel()
            df = model.prepare_features(reservation_features, customer_features)

            if df.empty:
                return {
                    "status": "skipped",
                    "reason": "No resolved reservations for training",
                }

            result = model.train_and_evaluate(df)

            return {
                "status": "success",
                "metrics": {
                    "auc_roc": result.metrics.auc_roc,
                    "precision": result.metrics.precision,
                    "recall": result.metrics.recall,
                    "f1": result.metrics.f1,
                    "support": result.metrics.support,
                },
                "feature_importance": result.feature_importance,
                "classification_report": result.metrics.classification_report,
                "predictions_count": len(result.predictions),
            }
        except Exception as e:
            logger.error(f"Cancellation model failed: {e}")
            return {"status": "error", "error": str(e)}

    def _run_demand_forecast(self, demand_ts: pd.DataFrame) -> dict:
        """Train demand forecast and return metrics + predictions."""
        try:
            model = DemandForecastModel(forecast_horizon=7)
            result = model.train_and_evaluate(demand_ts)

            metrics_dict = {}
            for business, metrics in result.metrics.items():
                metrics_dict[business] = {
                    "mae": round(metrics.mae, 3),
                    "rmse": round(metrics.rmse, 3),
                    "r2": round(metrics.r2, 3),
                    "mape": round(metrics.mape, 1),
                    "support": metrics.support,
                }

            forecasts_dict = {}
            if not result.forecasts.empty:
                for business_name, group in result.forecasts.groupby("business_name"):
                    forecasts_dict[business_name] = group[
                        ["date", "predicted_reservations", "is_weekend"]
                    ].to_dict(orient="records")

            return {
                "status": "success",
                "metrics": metrics_dict,
                "feature_importance": result.feature_importance,
                "forecasts": forecasts_dict,
            }
        except Exception as e:
            logger.error(f"Demand forecast failed: {e}")
            return {"status": "error", "error": str(e)}

    def _store_results(
        self,
        segmentation: dict,
        cancellation: dict,
        demand: dict,
        daily_demand: pd.DataFrame,
    ):
        """Persist predictions and metrics to the database."""
        try:
            with sync_engine.connect() as conn:
                # Check if ml_predictions table exists
                result = conn.execute(
                    text(
                        "SELECT EXISTS ("
                        "  SELECT FROM information_schema.tables "
                        "  WHERE table_name = 'ml_predictions'"
                        ")"
                    )
                )
                if not result.scalar():
                    logger.warning(
                        "ml_predictions table doesn't exist — skipping storage. "
                        "Run the migration first (002_ml_tables.sql)"
                    )
                    return

                # Store segmentation predictions
                if segmentation.get("status") == "success":
                    for seg in segmentation.get("customer_segments", []):
                        conn.execute(
                            text(
                                "INSERT INTO ml_predictions "
                                "(id, business_id, model_name, model_version, "
                                "entity_type, entity_id, prediction, computed_at) "
                                "VALUES (:id, :business_id, :model, :version, "
                                "'customer', :entity_id, :prediction, NOW())"
                            ),
                            {
                                "id": str(uuid.uuid4()),
                                "business_id": self.business_id,
                                "model": "customer_segmentation",
                                "version": f"run_{self.run_id}",
                                "entity_id": str(seg["customer_id"]),
                                "prediction": json.dumps(
                                    {
                                        "segment": seg["segment_label"],
                                        "recency_days": seg["recency"],
                                        "frequency": seg["frequency"],
                                        "monetary": float(seg["monetary"]),
                                    }
                                ),
                            },
                        )

                # Store daily metrics
                if not daily_demand.empty:
                    for _, row in daily_demand.iterrows():
                        conn.execute(
                            text(
                                "INSERT INTO business_daily_metrics "
                                "(id, business_id, date, total_reservations, "
                                "completed_reservations, cancelled_reservations, "
                                "total_guests, total_revenue, peak_hour, "
                                "utilization_rate, computed_at) "
                                "VALUES (:id, :biz, :date, :total, :completed, "
                                ":cancelled, :guests, :revenue, :peak, :util, NOW()) "
                                "ON CONFLICT (business_id, date) DO UPDATE SET "
                                "total_reservations = EXCLUDED.total_reservations, "
                                "completed_reservations = EXCLUDED.completed_reservations, "
                                "cancelled_reservations = EXCLUDED.cancelled_reservations, "
                                "total_guests = EXCLUDED.total_guests, "
                                "total_revenue = EXCLUDED.total_revenue, "
                                "peak_hour = EXCLUDED.peak_hour, "
                                "utilization_rate = EXCLUDED.utilization_rate, "
                                "computed_at = NOW()"
                            ),
                            {
                                "id": str(uuid.uuid4()),
                                "biz": str(row["business_id"]),
                                "date": str(row["date"]),
                                "total": int(row["total_reservations"]),
                                "completed": int(row.get("completed", 0)),
                                "cancelled": int(row.get("cancelled", 0)),
                                "guests": int(row["total_guests"]),
                                "revenue": float(row.get("total_revenue", 0)),
                                "peak": int(row["peak_hour"])
                                if pd.notna(row.get("peak_hour"))
                                else None,
                                "util": float(row["utilization_rate"])
                                if pd.notna(row.get("utilization_rate"))
                                else None,
                            },
                        )

                conn.commit()
                logger.info("Predictions and metrics stored successfully")

        except Exception as e:
            logger.error(f"Failed to store results: {e}")
