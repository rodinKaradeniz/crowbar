import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.table_area import TableArea


class Table(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tables"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_tables_positive_capacity"),
        CheckConstraint(
            "shape IN ('round', 'square', 'rectangle', 'bar', 'booth')",
            name="ck_tables_shape",
        ),
        CheckConstraint(
            "operational_state IN ('ready', 'cleaning', 'out_of_service')",
            name="ck_tables_operational_state",
        ),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    area_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("table_areas.id", ondelete="RESTRICT"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    shape: Mapped[str] = mapped_column(String(20), default="square", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    operational_state: Mapped[str] = mapped_column(
        String(20), default="ready", nullable=False
    )
    operational_state_reason: Mapped[str | None] = mapped_column(Text)
    operational_state_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    operational_state_changed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    operational_state_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    qr_token_revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    area: Mapped["TableArea"] = relationship(back_populates="tables")
