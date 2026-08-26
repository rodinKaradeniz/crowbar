"""
Customer Segmentation Model

Uses K-Means clustering on operational recency, frequency, and party volume
to group customers into actionable segments.

Segments are labeled based on cluster centroids:
    - Champions: Low recency, high frequency, high party volume
    - Loyal: Moderate recency, good frequency
    - At Risk: High recency, was previously active
    - New: Low frequency, recent first booking
    - Lost: High recency, low frequency
"""

import logging

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

# Segment labels assigned based on centroid analysis
SEGMENT_LABELS = {
    "champions": "Champions — frequent, recent, high-value customers",
    "loyal": "Loyal — consistent bookers with good engagement",
    "at_risk": "At Risk — previously active but fading away",
    "new": "New — recent sign-ups with few bookings",
    "lost": "Lost — haven't booked in a long time",
}


#: Guests with visit history needed before segments are produced.
MIN_CUSTOMERS = 20


class CustomerSegmentationModel:
    """K-Means customer segmentation on operational booking features."""

    def __init__(self, n_clusters: int = 4, random_state: int = 42):
        #: Set when a floor was not met; None after a successful fit.
        self.insufficient_reason: str | None = None
        self.n_clusters = n_clusters
        self.random_state = random_state
        self.scaler = StandardScaler()
        self.model = KMeans(
            n_clusters=n_clusters,
            random_state=random_state,
            n_init=10,
        )
        self.cluster_labels: dict[int, str] = {}
        self.centroids: pd.DataFrame | None = None

    def fit_predict(self, rfm: pd.DataFrame) -> pd.DataFrame:
        """
        Fit the segmentation model and return customer segments.

        Args:
            rfm: DataFrame with columns [customer_id, recency, frequency, engagement]

        Returns:
            DataFrame with customer_id, cluster, segment_label, and RFM values
        """
        feature_cols = ["recency", "frequency", "engagement"]
        X = rfm[feature_cols].copy()

        # Minimum-data floor. Clustering a handful of guests produces segment
        # labels — "Champions", "At Risk" — that read as findings but describe
        # three people. The caller checks `insufficient_reason` before showing
        # any of it.
        if len(X) < MIN_CUSTOMERS:
            self.insufficient_reason = (
                f"{len(X)} guest(s) with visit history; at least "
                f"{MIN_CUSTOMERS} are needed before segments mean anything."
            )
            logger.info("Segmentation skipped: %s", self.insufficient_reason)
            return rfm.iloc[0:0].copy()
        self.insufficient_reason = None

        # Handle edge case: fewer customers than clusters
        actual_clusters = min(self.n_clusters, len(X))
        if actual_clusters < self.n_clusters:
            logger.warning(
                f"Only {len(X)} customers — reducing clusters from "
                f"{self.n_clusters} to {actual_clusters}"
            )
            self.model = KMeans(
                n_clusters=actual_clusters,
                random_state=self.random_state,
                n_init=10,
            )

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Fit and predict
        clusters = self.model.fit_predict(X_scaled)

        # Build result
        result = rfm.copy()
        result["cluster"] = clusters

        # Analyze centroids to assign human-readable labels
        self.centroids = pd.DataFrame(
            self.scaler.inverse_transform(self.model.cluster_centers_),
            columns=feature_cols,
        )
        self.centroids["cluster"] = range(len(self.centroids))
        self._assign_labels()

        result["segment_label"] = result["cluster"].map(self.cluster_labels)

        logger.info(
            f"Segmentation complete: {actual_clusters} clusters, "
            f"{len(result)} customers"
        )

        return result

    def _assign_labels(self):
        """
        Assign human-readable segment labels based on centroid characteristics.

        Strategy: rank clusters by each RFM dimension, then assign labels
        using a rule-based approach on the ranks.
        """
        c = self.centroids.copy()

        # Rank each dimension (lower rank = "better" for that dimension)
        # For recency: lower is better (more recent)
        c["recency_rank"] = c["recency"].rank(ascending=True)
        # For frequency: higher is better
        c["frequency_rank"] = c["frequency"].rank(ascending=False)
        # For party-volume engagement: higher is better
        c["engagement_rank"] = c["engagement"].rank(ascending=False)

        # Combined score (lower = better overall customer)
        c["score"] = c["recency_rank"] + c["frequency_rank"] + c["engagement_rank"]
        c = c.sort_values("score")

        labels = ["champions", "loyal", "at_risk", "lost"]
        for i, (_, row) in enumerate(c.iterrows()):
            label = labels[i] if i < len(labels) else f"segment_{i}"
            self.cluster_labels[int(row["cluster"])] = label

    def get_summary(self) -> dict:
        """Return a summary of the segmentation results."""
        if self.centroids is None:
            return {"error": "Model not fitted yet"}

        return {
            "n_clusters": len(self.centroids),
            "centroids": self.centroids[
                ["cluster", "recency", "frequency", "engagement"]
            ].to_dict(orient="records"),
            "labels": self.cluster_labels,
        }
