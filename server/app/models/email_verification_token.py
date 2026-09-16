import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class EmailVerificationToken(Base, UUIDMixin):
    """Proof that someone can read mail at a given address.

    Migration 053. Deliberately the same shape as PasswordResetToken, with one
    addition: `new_email`. NULL means "prove the address already on the user";
    set means "a requested email change, not yet applied". The pending address
    lives here rather than on the user so that a superseded token can never
    apply a newer request.
    """

    __tablename__ = "email_verification_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False
    )
    new_email: Mapped[str | None] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    user: Mapped["User"] = relationship(back_populates="email_verification_tokens")


from app.models.user import User  # noqa: E402
