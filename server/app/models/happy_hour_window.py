import uuid
from datetime import time

from sqlalchemy import Boolean, ForeignKey, Integer, String, Time
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class HappyHourWindow(Base, UUIDMixin, TimestampMixin):
    """A business-wide happy-hour time window.

    ``days_of_week`` uses the canonical 0=Monday..6=Sunday index convention
    (see ``app.constants.days``). ``start_time``/``end_time`` are wall-clock
    local times interpreted against ``businesses.timezone``.
    """

    __tablename__ = "happy_hour_windows"

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    days_of_week: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
