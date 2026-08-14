from sqlalchemy import Boolean, CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("session_version > 0", name="ck_users_session_version_positive"),
    )

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50))
    avatar: Mapped[str | None] = mapped_column(String(500))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    user_type: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    session_version: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
    )

    staff_assignments: Mapped[list["Staff"]] = relationship(
        back_populates="user", lazy="selectin"
    )
    password_reset_tokens: Mapped[list["PasswordResetToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


# Avoid circular import issues
from app.models.staff import Staff  # noqa: E402
from app.models.password_reset_token import PasswordResetToken  # noqa: E402
