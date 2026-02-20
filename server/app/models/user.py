from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50))
    avatar: Mapped[str | None] = mapped_column(String(500))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    user_type: Mapped[str] = mapped_column(String(20), nullable=False)

    staff_assignments: Mapped[list["Staff"]] = relationship(
        back_populates="user", lazy="selectin"
    )
    reservations: Mapped[list["Reservation"]] = relationship(
        back_populates="customer", lazy="selectin"
    )


# Avoid circular import issues
from app.models.reservation import Reservation  # noqa: E402
from app.models.staff import Staff  # noqa: E402
