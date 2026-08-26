import uuid

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Staff(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "staff"

    # Mirrors migration 049. Capabilities are resolved from this role in
    # app/core/permissions.py; nothing per-role is stored on the row.
    __table_args__ = (
        CheckConstraint(
            "role IN ('owner', 'manager', 'host_server', 'bar_kitchen', "
            "'inventory_operator')",
            name="ck_staff_role",
        ),
        UniqueConstraint("user_id", "business_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)

    user: Mapped["User"] = relationship(back_populates="staff_assignments")
    business: Mapped["Business"] = relationship(back_populates="staff")


from app.models.business import Business  # noqa: E402
from app.models.user import User  # noqa: E402
