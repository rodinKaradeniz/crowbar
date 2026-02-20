"""
Demand Forecasting Model

Predicts future reservation volume per business using gradient boosting
on time-series features (lags, rolling averages, calendar effects).

Provides 7-day-ahead forecasts that help businesses with staffing
and capacity planning.
"""

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit

logger = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "day_of_week",
    "is_weekend",
    "month",
    "week_of_year",
    "demand_lag_1d",
    "demand_lag_7d",
    "demand_lag_14d",
    "demand_rolling_7d_mean",
    "demand_rolling_14d_mean",
]

TARGET_COLUMN = "total_reservations"


@dataclass
class ForecastMetrics:
    """Evaluation metrics for the demand forecast model."""

    mae: float = 0.0
    rmse: float = 0.0
    r2: float = 0.0
    mape: float = 0.0
    support: int = 0


@dataclass
class ForecastResult:
    """Complete result of a demand forecasting run."""

    metrics: dict[str, ForecastMetrics] = field(default_factory=dict)
    forecasts: pd.DataFrame = field(default_factory=pd.DataFrame)
    feature_importance: dict[str, float] = field(default_factory=dict)


class DemandForecastModel:
    """Per-business demand forecasting using LightGBM regression."""

    def __init__(self, random_state: int = 42, forecast_horizon: int = 7):
        self.random_state = random_state
        self.forecast_horizon = forecast_horizon
        self.models: dict[str, LGBMRegressor] = {}
        self.feature_columns = FEATURE_COLUMNS.copy()

    def _create_model(self) -> LGBMRegressor:
        return LGBMRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            num_leaves=15,
            min_child_samples=3,
            subsample=0.8,
            random_state=self.random_state,
            verbose=-1,
        )

    def train_and_evaluate(
        self, demand_features: pd.DataFrame
    ) -> ForecastResult:
        """
        Train a demand model per business and evaluate with time-series CV.

        Args:
            demand_features: Output of build_demand_timeseries_features()

        Returns:
            ForecastResult with per-business metrics and forecasts
        """
        result = ForecastResult()
        all_forecasts = []

        for business_id, group in demand_features.groupby("business_id"):
            df = group.sort_values("date").copy()

            # Drop rows with NaN lag features (beginning of time series)
            available_features = [
                c for c in self.feature_columns if c in df.columns
            ]
            df_clean = df.dropna(subset=available_features)

            if len(df_clean) < 5:
                logger.warning(
                    f"Business {business_id}: only {len(df_clean)} rows — skipping"
                )
                continue

            X = df_clean[available_features]
            y = df_clean[TARGET_COLUMN]

            model = self._create_model()

            # Time series cross-validation
            n_splits = min(3, max(2, len(df_clean) // 3))
            tscv = TimeSeriesSplit(n_splits=n_splits)

            cv_predictions = []
            cv_actuals = []

            for train_idx, test_idx in tscv.split(X):
                X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
                y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

                model.fit(X_train, y_train)
                preds = model.predict(X_test)

                cv_predictions.extend(preds)
                cv_actuals.extend(y_test)

            # Final fit on all data
            model.fit(X, y)
            self.models[str(business_id)] = model

            # Metrics
            cv_predictions = np.array(cv_predictions)
            cv_actuals = np.array(cv_actuals)

            metrics = ForecastMetrics(
                mae=mean_absolute_error(cv_actuals, cv_predictions),
                rmse=np.sqrt(mean_squared_error(cv_actuals, cv_predictions)),
                r2=r2_score(cv_actuals, cv_predictions)
                if len(cv_actuals) > 1
                else 0.0,
                mape=np.mean(
                    np.abs(
                        (cv_actuals - cv_predictions)
                        / np.maximum(cv_actuals, 1)
                    )
                )
                * 100,
                support=len(df_clean),
            )

            business_name = df["business_name"].iloc[0] if "business_name" in df.columns else str(business_id)
            result.metrics[business_name] = metrics

            logger.info(
                f"Demand model for {business_name} — "
                f"MAE: {metrics.mae:.2f}, R²: {metrics.r2:.3f}"
            )

            # Generate future forecasts
            forecast = self._generate_forecast(df, model, available_features)
            if forecast is not None:
                forecast["business_id"] = business_id
                forecast["business_name"] = business_name
                all_forecasts.append(forecast)

        if all_forecasts:
            result.forecasts = pd.concat(all_forecasts, ignore_index=True)

        # Aggregate feature importance across all business models
        if self.models:
            importance_agg = {}
            for model in self.models.values():
                for feat, imp in zip(
                    self.feature_columns[: len(model.feature_importances_)],
                    model.feature_importances_,
                ):
                    importance_agg[feat] = importance_agg.get(feat, 0) + imp

            n_models = len(self.models)
            result.feature_importance = {
                k: round(v / n_models, 2)
                for k, v in sorted(
                    importance_agg.items(), key=lambda x: x[1], reverse=True
                )
            }

        return result

    def _generate_forecast(
        self,
        historical: pd.DataFrame,
        model: LGBMRegressor,
        feature_cols: list[str],
    ) -> pd.DataFrame | None:
        """
        Generate N-day ahead forecast by iteratively predicting one day at a time.
        """
        df = historical.sort_values("date").copy()
        last_date = pd.to_datetime(df["date"].max())

        forecasts = []
        # Build a rolling window for lag computation
        recent_demand = df["total_reservations"].values.tolist()

        for day_offset in range(1, self.forecast_horizon + 1):
            forecast_date = last_date + pd.Timedelta(days=day_offset)

            # Build features for this future date
            row = {
                "day_of_week": forecast_date.dayofweek,
                "is_weekend": int(forecast_date.dayofweek in [4, 5, 6]),
                "month": forecast_date.month,
                "week_of_year": forecast_date.isocalendar().week,
            }

            # Lag features from recent demand
            if len(recent_demand) >= 1:
                row["demand_lag_1d"] = recent_demand[-1]
            if len(recent_demand) >= 7:
                row["demand_lag_7d"] = recent_demand[-7]
            if len(recent_demand) >= 14:
                row["demand_lag_14d"] = recent_demand[-14]

            # Rolling averages
            if len(recent_demand) >= 7:
                row["demand_rolling_7d_mean"] = np.mean(recent_demand[-7:])
            if len(recent_demand) >= 14:
                row["demand_rolling_14d_mean"] = np.mean(recent_demand[-14:])

            # Create feature vector (fill missing with 0)
            X_future = pd.DataFrame([row])
            for col in feature_cols:
                if col not in X_future.columns:
                    X_future[col] = 0
            X_future = X_future[feature_cols]

            # Predict
            pred = max(0, round(model.predict(X_future)[0], 1))

            forecasts.append(
                {
                    "date": forecast_date,
                    "predicted_reservations": pred,
                    "day_of_week": forecast_date.dayofweek,
                    "is_weekend": int(forecast_date.dayofweek in [4, 5, 6]),
                }
            )

            # Add prediction to rolling window for next iteration
            recent_demand.append(pred)

        return pd.DataFrame(forecasts) if forecasts else None
