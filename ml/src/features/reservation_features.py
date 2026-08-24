"""
Feature engineering for reservation-level data.

Extracts temporal, behavioral, and contextual features from raw reservations
for use in cancellation prediction, demand forecasting, and other models.
"""

import numpy as np
import pandas as pd


def build_reservation_features(reservations: pd.DataFrame) -> pd.DataFrame:
    """
    Build ML-ready features from raw reservation data.

    Input columns expected:
        reservation_id, business_id, customer_id, service_type_id,
        reservation_time, status, guests,
        booked_at, business_name, service_type_name, service_capacity,
        service_duration

    Returns DataFrame with one row per reservation and engineered features.
    """
    df = reservations.copy()

    # Ensure datetime types
    df["reservation_time"] = pd.to_datetime(df["reservation_time"], utc=True)
    df["booked_at"] = pd.to_datetime(df["booked_at"], utc=True)

    # --- Temporal features ---
    df["day_of_week"] = df["reservation_time"].dt.dayofweek  # 0=Mon, 6=Sun
    df["hour_of_day"] = df["reservation_time"].dt.hour
    df["is_weekend"] = df["day_of_week"].isin([4, 5, 6]).astype(int)  # Fri-Sun
    df["month"] = df["reservation_time"].dt.month
    df["week_of_year"] = df["reservation_time"].dt.isocalendar().week.astype(int)

    # --- Lead time (how far in advance the reservation was made) ---
    df["lead_time_hours"] = (
        (df["reservation_time"] - df["booked_at"]).dt.total_seconds() / 3600
    ).round(2)
    df["lead_time_days"] = (df["lead_time_hours"] / 24).round(2)

    # --- Guest ratio (how full is the service type?) ---
    df["guest_capacity_ratio"] = np.where(
        df["service_capacity"] > 0,
        df["guests"] / df["service_capacity"],
        0,
    )

    # --- Has note (proxy for customer engagement) ---
    df["has_note"] = df["note"].notna().astype(int)

    # --- Binary target for cancellation prediction ---
    df["is_cancelled"] = (df["status"] == "cancelled").astype(int)

    return df


def build_daily_demand(reservations: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate reservations into daily demand per business.

    Returns DataFrame with columns:
        business_id, business_name, date, total_reservations,
        total_guests, completed, cancelled, pending, confirmed,
        avg_lead_time_hours, peak_hour, utilization_rate
    """
    df = reservations.copy()
    df["reservation_time"] = pd.to_datetime(df["reservation_time"], utc=True)
    df["date"] = df["reservation_time"].dt.date

    daily = (
        df.groupby(["business_id", "business_name", "date"])
        .agg(
            total_reservations=("reservation_id", "count"),
            total_guests=("guests", "sum"),
            completed=("status", lambda x: (x == "completed").sum()),
            cancelled=("status", lambda x: (x == "cancelled").sum()),
            pending=("status", lambda x: (x == "pending").sum()),
            confirmed=("status", lambda x: (x == "confirmed").sum()),
            avg_lead_time_hours=(
                "lead_time_hours",
                lambda x: x.mean() if "lead_time_hours" in df.columns else np.nan,
            ),
        )
        .reset_index()
    )

    # Peak hour per business per day
    peak_hours = (
        df.assign(hour=df["reservation_time"].dt.hour)
        .groupby(["business_id", "date", "hour"])
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
        .drop_duplicates(subset=["business_id", "date"])
        .rename(columns={"hour": "peak_hour"})
        [["business_id", "date", "peak_hour"]]
    )

    daily = daily.merge(peak_hours, on=["business_id", "date"], how="left")

    # Utilization rate (reservations / max_guests from business)
    if "business_max_guests" in df.columns:
        max_guests_map = (
            df.groupby("business_id")["business_max_guests"].first().to_dict()
        )
        daily["utilization_rate"] = daily.apply(
            lambda row: (
                min(row["total_guests"] / max_guests_map.get(row["business_id"], 1), 1.0)
            ),
            axis=1,
        ).round(4)
    else:
        daily["utilization_rate"] = np.nan

    return daily


def build_demand_timeseries_features(daily_demand: pd.DataFrame) -> pd.DataFrame:
    """
    Add time-series features to daily demand data for forecasting.

    Adds lag features, rolling averages, and calendar features.
    """
    df = daily_demand.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["business_id", "date"])

    features = []
    for business_id, group in df.groupby("business_id"):
        g = group.copy()

        # Lag features
        for lag in [1, 7, 14]:
            g[f"demand_lag_{lag}d"] = g["total_reservations"].shift(lag)

        # Rolling averages
        g["demand_rolling_7d_mean"] = (
            g["total_reservations"].rolling(window=7, min_periods=1).mean().round(2)
        )
        g["demand_rolling_14d_mean"] = (
            g["total_reservations"].rolling(window=14, min_periods=1).mean().round(2)
        )

        # Calendar features
        g["day_of_week"] = g["date"].dt.dayofweek
        g["is_weekend"] = g["day_of_week"].isin([4, 5, 6]).astype(int)
        g["month"] = g["date"].dt.month
        g["week_of_year"] = g["date"].dt.isocalendar().week.astype(int)

        features.append(g)

    return pd.concat(features, ignore_index=True) if features else df
