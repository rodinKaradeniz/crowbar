import uuid
from datetime import date, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    SmallInteger,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class BookingSchedule(Base, UUIDMixin, TimestampMixin):
    """Business booking policy, optionally replaced in full for one service."""

    __tablename__ = "booking_schedules"
    __table_args__ = (
        CheckConstraint(
            "minimum_notice_minutes >= 0",
            name="ck_booking_schedules_minimum_notice_nonnegative",
        ),
        CheckConstraint(
            "advance_booking_days > 0",
            name="ck_booking_schedules_advance_booking_days_positive",
        ),
        CheckConstraint(
            "slot_interval_minutes > 0",
            name="ck_booking_schedules_slot_interval_positive",
        ),
        CheckConstraint(
            "default_duration_minutes > 0",
            name="ck_booking_schedules_default_duration_positive",
        ),
        ForeignKeyConstraint(
            ["service_type_id", "business_id"],
            ["service_types.id", "service_types.business_id"],
            name="fk_booking_schedules_service_business",
            ondelete="CASCADE",
        ),
        Index(
            "uq_booking_schedules_business_default",
            "business_id",
            unique=True,
            postgresql_where=text("service_type_id IS NULL"),
        ),
        Index(
            "uq_booking_schedules_service_override",
            "service_type_id",
            unique=True,
            postgresql_where=text("service_type_id IS NOT NULL"),
        ),
        Index("idx_booking_schedules_business", "business_id"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    service_type_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    minimum_notice_minutes: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    advance_booking_days: Mapped[int] = mapped_column(
        Integer, default=30, nullable=False
    )
    slot_interval_minutes: Mapped[int] = mapped_column(
        Integer, default=15, nullable=False
    )
    default_duration_minutes: Mapped[int] = mapped_column(
        Integer, default=60, nullable=False
    )

    business: Mapped["Business"] = relationship(back_populates="booking_schedules")
    service_type: Mapped["ServiceType | None"] = relationship(
        back_populates="booking_schedule",
        foreign_keys=[service_type_id],
    )
    windows: Mapped[list["BookingScheduleWindow"]] = relationship(
        back_populates="schedule",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
        order_by="BookingScheduleWindow.weekday, BookingScheduleWindow.start_time",
    )
    exceptions: Mapped[list["BookingScheduleException"]] = relationship(
        back_populates="schedule",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
        order_by="BookingScheduleException.local_date",
    )


class BookingScheduleWindow(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "booking_schedule_windows"
    __table_args__ = (
        CheckConstraint(
            "weekday BETWEEN 0 AND 6",
            name="ck_booking_schedule_windows_weekday",
        ),
        CheckConstraint(
            "(NOT ends_next_day AND end_time > start_time) "
            "OR (ends_next_day AND end_time < start_time)",
            name="ck_booking_schedule_windows_range",
        ),
        UniqueConstraint(
            "schedule_id",
            "weekday",
            "start_time",
            "end_time",
            "ends_next_day",
            name="uq_booking_schedule_windows_value",
        ),
        Index(
            "idx_booking_schedule_windows_schedule_weekday",
            "schedule_id",
            "weekday",
        ),
    )

    schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("booking_schedules.id", ondelete="CASCADE"),
        nullable=False,
    )
    weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    ends_next_day: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    schedule: Mapped["BookingSchedule"] = relationship(back_populates="windows")


class BookingScheduleException(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "booking_schedule_exceptions"
    __table_args__ = (
        UniqueConstraint(
            "schedule_id",
            "local_date",
            name="uq_booking_schedule_exceptions_date",
        ),
        Index(
            "idx_booking_schedule_exceptions_schedule_date",
            "schedule_id",
            "local_date",
        ),
    )

    schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("booking_schedules.id", ondelete="CASCADE"),
        nullable=False,
    )
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    schedule: Mapped["BookingSchedule"] = relationship(back_populates="exceptions")
    windows: Mapped[list["BookingScheduleExceptionWindow"]] = relationship(
        back_populates="exception",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
        order_by="BookingScheduleExceptionWindow.start_time",
    )


class BookingScheduleExceptionWindow(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "booking_schedule_exception_windows"
    __table_args__ = (
        CheckConstraint(
            "(NOT ends_next_day AND end_time > start_time) "
            "OR (ends_next_day AND end_time < start_time)",
            name="ck_booking_schedule_exception_windows_range",
        ),
        UniqueConstraint(
            "exception_id",
            "start_time",
            "end_time",
            "ends_next_day",
            name="uq_booking_schedule_exception_windows_value",
        ),
        Index(
            "idx_booking_schedule_exception_windows_exception",
            "exception_id",
        ),
    )

    exception_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("booking_schedule_exceptions.id", ondelete="CASCADE"),
        nullable=False,
    )
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    ends_next_day: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    exception: Mapped["BookingScheduleException"] = relationship(
        back_populates="windows"
    )


from app.models.business import Business  # noqa: E402
from app.models.service_type import ServiceType  # noqa: E402
