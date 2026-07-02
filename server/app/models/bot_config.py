import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class BotConfig(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "bot_configs"

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    greeting: Mapped[str | None] = mapped_column(Text, nullable=True)
    tone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    enabled_intents: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    hours_behavior: Mapped[str | None] = mapped_column(String(32), nullable=True)
    system_prompt_override: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    __table_args__ = (UniqueConstraint("business_id", "channel", name="uq_bot_configs_business_channel"),)
