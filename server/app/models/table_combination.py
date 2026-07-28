import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class TableCombination(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "table_combinations"
    __table_args__ = (
        CheckConstraint(
            "capacity_override IS NULL OR capacity_override > 0",
            name="ck_table_combinations_positive_capacity",
        ),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False
    )
    area_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("table_areas.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    capacity_override: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    members: Mapped[list["TableCombinationMember"]] = relationship(
        back_populates="combination", cascade="all, delete-orphan", lazy="selectin"
    )


class TableCombinationMember(Base):
    __tablename__ = "table_combination_members"

    combination_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("table_combinations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    table_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tables.id", ondelete="RESTRICT"), primary_key=True
    )

    combination: Mapped[TableCombination] = relationship(back_populates="members")
