"""
Feature engineering for customer-level data.

Builds RFM (Recency, Frequency, Monetary) features and behavioral
profiles for customer segmentation and CLV estimation.
"""

import numpy as np
import pandas as pd


def build_customer_features(
    reservations: pd.DataFrame,
    customers: pd.DataFrame,
    reference_date: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """
    Build per-customer behavioral features from reservation history.

    Returns DataFrame with one row per customer and features:
        - RFM: recency, frequency, monetary
        - Behavioral: cancellation rate, avg guests, preferred service, etc.
        - Temporal: tenure, booking patterns
    """
    df = reservations.copy()
    df["reservation_time"] = pd.to_datetime(df["reservation_time"], utc=True)
    df["booked_at"] = pd.to_datetime(df["booked_at"], utc=True)

    if reference_date is None:
        reference_date = pd.Timestamp.now(tz="UTC")

    # --- Per-customer aggregations ---
    customer_agg = (
        df.groupby("customer_id")
        .agg(
            # Recency: days since last reservation
            last_reservation=("reservation_time", "max"),
            first_reservation=("reservation_time", "min"),
            # Frequency
            total_reservations=("reservation_id", "count"),
            # Monetary
            total_spend=("payment_amount", lambda x: x.fillna(0).sum()),
            avg_spend=("payment_amount", lambda x: x.dropna().mean()),
            # Behavioral
            total_guests=("guests", "sum"),
            avg_guests=("guests", "mean"),
            cancelled_count=("status", lambda x: (x == "cancelled").sum()),
            completed_count=("status", lambda x: (x == "completed").sum()),
            # Diversity
            unique_businesses=("business_id", "nunique"),
            unique_service_types=("service_type_id", "nunique"),
            # Engagement
            has_note_count=("note", lambda x: x.notna().sum()),
        )
        .reset_index()
    )

    # --- Derived features ---
    customer_agg["recency_days"] = (
        (reference_date - customer_agg["last_reservation"]).dt.total_seconds()
        / 86400
    ).round(2)

    customer_agg["tenure_days"] = (
        (reference_date - customer_agg["first_reservation"]).dt.total_seconds()
        / 86400
    ).round(2)

    customer_agg["cancellation_rate"] = np.where(
        customer_agg["total_reservations"] > 0,
        (customer_agg["cancelled_count"] / customer_agg["total_reservations"]).round(4),
        0,
    )

    customer_agg["completion_rate"] = np.where(
        customer_agg["total_reservations"] > 0,
        (customer_agg["completed_count"] / customer_agg["total_reservations"]).round(4),
        0,
    )

    customer_agg["avg_booking_frequency_days"] = np.where(
        customer_agg["total_reservations"] > 1,
        (
            customer_agg["tenure_days"]
            / (customer_agg["total_reservations"] - 1)
        ).round(2),
        np.nan,
    )

    customer_agg["note_rate"] = np.where(
        customer_agg["total_reservations"] > 0,
        (customer_agg["has_note_count"] / customer_agg["total_reservations"]).round(4),
        0,
    )

    # --- Merge with customer registration data ---
    cust = customers.copy()
    cust["registered_at"] = pd.to_datetime(cust["registered_at"], utc=True)

    result = cust.merge(customer_agg, on="customer_id", how="left")

    # Fill NaN for customers with no reservations
    fill_zero_cols = [
        "total_reservations",
        "total_spend",
        "total_guests",
        "cancelled_count",
        "completed_count",
        "unique_businesses",
        "unique_service_types",
        "has_note_count",
        "cancellation_rate",
        "completion_rate",
        "note_rate",
    ]
    for col in fill_zero_cols:
        if col in result.columns:
            result[col] = result[col].fillna(0)

    return result


def build_rfm_features(customer_features: pd.DataFrame) -> pd.DataFrame:
    """
    Extract clean RFM (Recency, Frequency, Monetary) matrix for clustering.

    Returns DataFrame with customer_id + R, F, M columns,
    plus scaled versions ready for clustering.
    """
    rfm = customer_features[["customer_id"]].copy()
    rfm["recency"] = customer_features["recency_days"]
    rfm["frequency"] = customer_features["total_reservations"]
    rfm["monetary"] = customer_features["total_spend"]

    # Drop customers with no reservations (can't cluster them meaningfully)
    rfm = rfm.dropna(subset=["recency"])
    rfm = rfm[rfm["frequency"] > 0]

    return rfm


def build_preferred_time_features(reservations: pd.DataFrame) -> pd.DataFrame:
    """
    For each customer, compute their preferred booking patterns.

    Returns DataFrame with:
        customer_id, preferred_day_of_week, preferred_hour,
        pct_weekend_bookings, pct_evening_bookings
    """
    df = reservations.copy()
    df["reservation_time"] = pd.to_datetime(df["reservation_time"], utc=True)
    df["day_of_week"] = df["reservation_time"].dt.dayofweek
    df["hour"] = df["reservation_time"].dt.hour

    prefs = (
        df.groupby("customer_id")
        .agg(
            preferred_day_of_week=("day_of_week", lambda x: x.mode().iloc[0] if len(x) > 0 else np.nan),
            preferred_hour=("hour", lambda x: x.mode().iloc[0] if len(x) > 0 else np.nan),
            pct_weekend=("day_of_week", lambda x: (x.isin([4, 5, 6])).mean()),
            pct_evening=("hour", lambda x: (x >= 17).mean()),
        )
        .reset_index()
    )

    return prefs
