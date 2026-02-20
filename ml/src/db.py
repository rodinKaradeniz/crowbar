"""
Database access layer for the ML service.

Read-only connection to the main application database.
Uses async SQLAlchemy for the API endpoints and sync connections
via pandas for ML pipeline data loading.
"""

import logging

import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.config import settings

logger = logging.getLogger(__name__)

# Async engine (for FastAPI endpoints)
async_engine = create_async_engine(
    settings.database_url,
    echo=settings.environment == "development",
    pool_size=3,
    max_overflow=5,
)

async_session = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Sync engine (for pandas read_sql in ML pipelines)
sync_engine = create_engine(
    settings.database_url_sync,
    echo=False,
    pool_size=3,
    max_overflow=5,
)


async def get_db() -> AsyncSession:
    """Async DB session for FastAPI dependency injection."""
    async with async_session() as session:
        yield session


async def check_db_connection() -> bool:
    """Verify database connectivity."""
    try:
        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False


def load_dataframe(query: str, params: dict | None = None) -> pd.DataFrame:
    """
    Load a SQL query result into a pandas DataFrame.
    Uses the sync engine — intended for ML pipeline use (not API endpoints).
    """
    with sync_engine.connect() as conn:
        return pd.read_sql(text(query), conn, params=params or {})


def load_reservations() -> pd.DataFrame:
    """Load all reservations with business and service type info."""
    query = """
        SELECT
            r.id AS reservation_id,
            r.business_id,
            r.customer_id,
            r.service_type_id,
            r.time AS reservation_time,
            r.status,
            r.guests,
            r.payment_amount,
            r.payment_status,
            r.note,
            r.custom_fields,
            r.created_at AS booked_at,
            b.name AS business_name,
            b.tags AS business_tags,
            b.max_guests AS business_max_guests,
            st.name AS service_type_name,
            st.capacity AS service_capacity,
            st.requires_payment,
            st.amount AS service_price,
            st.duration AS service_duration
        FROM reservations r
        JOIN businesses b ON r.business_id = b.id
        JOIN service_types st ON r.service_type_id = st.id
        ORDER BY r.time
    """
    return load_dataframe(query)


def load_customers() -> pd.DataFrame:
    """Load all customer users."""
    query = """
        SELECT
            id AS customer_id,
            email,
            name,
            phone,
            created_at AS registered_at
        FROM users
        WHERE user_type = 'customer'
    """
    return load_dataframe(query)


def load_businesses() -> pd.DataFrame:
    """Load all businesses with their config."""
    query = """
        SELECT
            id AS business_id,
            name,
            slug,
            tags,
            max_guests,
            reservation_time,
            time_slot_interval,
            advance_booking_days,
            operating_hours,
            created_at
        FROM businesses
    """
    return load_dataframe(query)


def load_service_types() -> pd.DataFrame:
    """Load all service types."""
    query = """
        SELECT
            id AS service_type_id,
            business_id,
            name,
            capacity,
            max_concurrent_bookings,
            requires_payment,
            amount AS price,
            duration,
            created_at
        FROM service_types
    """
    return load_dataframe(query)
