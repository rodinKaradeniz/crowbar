"""ORM mappings for the optional ML service's output tables.

`ml_predictions` and `business_daily_metrics` have existed since migration 002
but were reachable only through raw SQL, so `Base.metadata.create_all` never
created them and no integration test could touch a code path that read one.
`analytics_service.get_high_risk_reservations` therefore blew up with
`relation "ml_predictions" does not exist` against the test database while
passing in development — mapping them closes that gap.

`ml_result_snapshots` is new in migration 049. It holds the last successful
dashboard payload per tenant so an ML restart degrades the Insights page
visibly instead of emptying it.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDMixin


class MLPrediction(Base, UUIDMixin):
    """One model's output for one entity.

    Read-only from the product's side: the ML service writes these, FastAPI only
    reads them, and nothing operational may block on a row being present.
    """

    __tablename__ = "ml_predictions"
    __table_args__ = (
        Index("idx_ml_predictions_model", "model_name"),
        Index("idx_ml_predictions_entity", "entity_type", "entity_id"),
        Index("idx_ml_predictions_business", "business_id"),
        Index("idx_ml_predictions_computed", "computed_at"),
    )

    # Nullable since migration 002: a cross-tenant model would write a null
    # business_id. Nothing writes one today, and every read filters on tenant.
    business_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE")
    )
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(50))
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    prediction: Mapped[dict] = mapped_column(JSONB, nullable=False)
    computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class BusinessDailyMetric(Base, UUIDMixin):
    """Pre-aggregated daily stats the ML pipeline writes.

    `total_revenue` is a legacy column name from before the product settled its
    money vocabulary. Nothing writes it and no report reads it; a figure derived
    from orders is ordered value, never revenue. See `docs/PRODUCT.md`.
    """

    __tablename__ = "business_daily_metrics"
    __table_args__ = (
        UniqueConstraint("business_id", "date"),
        Index("idx_daily_metrics_business", "business_id"),
        Index("idx_daily_metrics_date", "date"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    total_reservations: Mapped[int | None] = mapped_column(Integer, default=0)
    completed_reservations: Mapped[int | None] = mapped_column(Integer, default=0)
    cancelled_reservations: Mapped[int | None] = mapped_column(Integer, default=0)
    no_show_count: Mapped[int | None] = mapped_column(Integer, default=0)
    total_guests: Mapped[int | None] = mapped_column(Integer, default=0)
    total_revenue: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=0)
    avg_lead_time_hours: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    peak_hour: Mapped[int | None] = mapped_column(Integer)
    utilization_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


#: The Insights resources FastAPI proxies and therefore snapshots.
ML_SNAPSHOT_RESOURCES = ("status", "segmentation", "cancellation", "demand")


class MLResultSnapshot(Base, UUIDMixin):
    """The last successful ML dashboard payload for one tenant and resource.

    One row per (business, resource): the newest result replaces the previous
    one, because a history of dashboard payloads has no reader. Served with
    `stale: true` and its `captured_at` when the ML service is unreachable, so
    an operator can tell a remembered number from a live one.
    """

    __tablename__ = "ml_result_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "business_id", "resource", name="uq_ml_result_snapshots_business_resource"
        ),
        CheckConstraint(
            "resource IN ('status', 'segmentation', 'cancellation', 'demand')",
            name="ck_ml_result_snapshots_resource",
        ),
        Index("idx_ml_result_snapshots_business", "business_id", "captured_at"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    resource: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
