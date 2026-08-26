"""
Cancellation Prediction Model

Binary classifier that predicts the probability a reservation will be cancelled.
Uses LightGBM for strong performance on tabular data with minimal tuning.

Features used:
    - Lead time (hours/days between booking and reservation)
    - Day of week, hour of day, weekend flag
    - Guest count and capacity ratio
    - Customer historical cancellation rate
    - Service type characteristics
"""

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import (
    classification_report,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import cross_val_predict, StratifiedKFold

logger = logging.getLogger(__name__)

# Features used for cancellation prediction
FEATURE_COLUMNS = [
    "lead_time_hours",
    "lead_time_days",
    "day_of_week",
    "hour_of_day",
    "is_weekend",
    "guests",
    "guest_capacity_ratio",
    "has_note",
    "customer_cancellation_rate",
    "customer_total_reservations",
    "customer_avg_guests",
]

TARGET_COLUMN = "is_cancelled"


@dataclass
class CancellationModelMetrics:
    """Stores evaluation metrics for the cancellation model."""

    auc_roc: float = 0.0
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    support: int = 0
    classification_report: str = ""


#: Terminal reservations needed before a cancellation model is trained.
#: Below this the metrics describe the sample, not the venue.
MIN_TRAINING_SAMPLES = 30


@dataclass
class CancellationModelResult:
    """Complete result of a cancellation model training run.

    `status` is `"insufficient_data"` when a minimum-data floor was not met.
    That is an ordinary state for a new venue, not an error — see the Model
    Policy section of `ml/CONTEXT.md`.
    """

    metrics: CancellationModelMetrics = field(default_factory=CancellationModelMetrics)
    feature_importance: dict[str, float] = field(default_factory=dict)
    predictions: pd.DataFrame = field(default_factory=pd.DataFrame)
    status: str = "success"
    insufficient_reason: str | None = None


class CancellationPredictionModel:
    """LightGBM-based cancellation risk predictor."""

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.model = LGBMClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            num_leaves=31,
            min_child_samples=5,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=random_state,
            verbose=-1,
            # Handle class imbalance (cancellations are usually minority)
            is_unbalance=True,
        )
        self.feature_columns = FEATURE_COLUMNS.copy()

    def prepare_features(
        self,
        reservation_features: pd.DataFrame,
        customer_features: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Merge reservation-level features with customer history features.

        Only includes reservations with a definitive outcome (completed or cancelled).
        """
        df = reservation_features.copy()

        # Only use resolved reservations for training
        df = df[df["status"].isin(["completed", "cancelled"])].copy()

        if len(df) == 0:
            logger.warning("No resolved reservations found for training")
            return pd.DataFrame()

        # Merge customer-level features
        cust_cols = ["customer_id", "cancellation_rate", "total_reservations", "avg_guests"]
        cust = customer_features[
            [c for c in cust_cols if c in customer_features.columns]
        ].copy()
        cust = cust.rename(
            columns={
                "cancellation_rate": "customer_cancellation_rate",
                "total_reservations": "customer_total_reservations",
                "avg_guests": "customer_avg_guests",
            }
        )

        df = df.merge(cust, on="customer_id", how="left")

        # Fill missing customer features with defaults
        df["customer_cancellation_rate"] = df["customer_cancellation_rate"].fillna(0)
        df["customer_total_reservations"] = df["customer_total_reservations"].fillna(1)
        df["customer_avg_guests"] = df["customer_avg_guests"].fillna(
            df["guests"].mean()
        )

        # Filter to available feature columns
        available_features = [c for c in self.feature_columns if c in df.columns]
        self.feature_columns = available_features

        return df

    def train_and_evaluate(self, df: pd.DataFrame) -> CancellationModelResult:
        """
        Train the model with cross-validation and return metrics + predictions.

        Uses stratified K-fold to handle class imbalance properly.
        """
        result = CancellationModelResult()

        # Minimum-data floor. Below it there is no model, and the caller is told
        # why rather than being handed a metric computed from a handful of rows.
        # A confident AUC over nine reservations is worse than no AUC, because
        # the dashboard renders it identically to a real one.
        if len(df) < MIN_TRAINING_SAMPLES:
            result.status = "insufficient_data"
            result.insufficient_reason = (
                f"{len(df)} terminal reservation(s); at least "
                f"{MIN_TRAINING_SAMPLES} are needed before a cancellation model "
                "is meaningful."
            )
            logger.info("Cancellation model skipped: %s", result.insufficient_reason)
            return result

        # Both outcomes have to be present. A dataset where nothing was ever
        # cancelled trains a model that predicts "never" perfectly and tells the
        # venue nothing.
        if df[TARGET_COLUMN].nunique() < 2:
            result.status = "insufficient_data"
            result.insufficient_reason = (
                "Every reservation in the training window had the same outcome, "
                "so there is nothing to distinguish."
            )
            logger.info("Cancellation model skipped: %s", result.insufficient_reason)
            return result

        X = df[self.feature_columns].copy()
        y = df[TARGET_COLUMN].copy()

        # Handle any remaining NaNs
        X = X.fillna(0)

        n_splits = min(5, max(2, len(df) // 5))
        cv = StratifiedKFold(
            n_splits=n_splits, shuffle=True, random_state=self.random_state
        )

        # Cross-validated predictions
        try:
            y_pred_proba = cross_val_predict(
                self.model, X, y, cv=cv, method="predict_proba"
            )[:, 1]
            y_pred = (y_pred_proba >= 0.5).astype(int)
        except Exception as e:
            logger.error(f"Cross-validation failed: {e}")
            # Fall back to simple train on all data
            self.model.fit(X, y)
            y_pred_proba = self.model.predict_proba(X)[:, 1]
            y_pred = self.model.predict(X)

        # Final model fit on all data (for future predictions)
        self.model.fit(X, y)

        # Metrics
        result.metrics = CancellationModelMetrics(
            auc_roc=roc_auc_score(y, y_pred_proba) if y.nunique() > 1 else 0.0,
            precision=precision_score(y, y_pred, zero_division=0),
            recall=recall_score(y, y_pred, zero_division=0),
            f1=f1_score(y, y_pred, zero_division=0),
            support=len(y),
            classification_report=classification_report(y, y_pred, zero_division=0),
        )

        # Feature importance
        importance = dict(
            zip(self.feature_columns, self.model.feature_importances_)
        )
        result.feature_importance = dict(
            sorted(importance.items(), key=lambda x: x[1], reverse=True)
        )

        # Predictions
        result.predictions = df[["reservation_id", "business_id", "customer_id"]].copy()
        result.predictions["cancellation_probability"] = y_pred_proba.round(4)
        result.predictions["predicted_cancelled"] = y_pred
        result.predictions["actual_status"] = df["status"].values

        logger.info(
            f"Cancellation model trained — AUC: {result.metrics.auc_roc:.3f}, "
            f"F1: {result.metrics.f1:.3f}, samples: {result.metrics.support}"
        )

        return result

    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Predict cancellation risk for new/upcoming reservations.

        Returns DataFrame with reservation_id and cancellation_probability.
        """
        X = df[self.feature_columns].copy().fillna(0)

        probabilities = self.model.predict_proba(X)[:, 1]

        predictions = df[["reservation_id", "business_id", "customer_id"]].copy()
        predictions["cancellation_probability"] = probabilities.round(4)
        predictions["risk_level"] = pd.cut(
            probabilities,
            bins=[0, 0.3, 0.6, 1.0],
            labels=["low", "medium", "high"],
        )

        return predictions
