import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class TableSeating(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "table_seatings"
    __table_args__ = (
        CheckConstraint("party_size > 0", name="ck_table_seatings_positive_party"),
        CheckConstraint("status IN ('open', 'closed')", name="ck_table_seatings_status"),
        CheckConstraint(
            "(reservation_id IS NOT NULL)::int + (queue_entry_id IS NOT NULL)::int = 1",
            name="ck_table_seatings_one_source",
        ),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False
    )
    reservation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reservations.id", ondelete="RESTRICT")
    )
    queue_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("queue_entries.id", ondelete="RESTRICT")
    )
    party_size: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False)
    opened_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    closed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    tables: Mapped[list["TableSeatingTable"]] = relationship(
        back_populates="seating", cascade="all, delete-orphan", lazy="selectin"
    )


class TableSeatingTable(Base):
    __tablename__ = "table_seating_tables"

    seating_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("table_seatings.id", ondelete="CASCADE"), primary_key=True
    )
    table_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tables.id", ondelete="RESTRICT"), primary_key=True
    )

    seating: Mapped[TableSeating] = relationship(back_populates="tables")
