"""
Shared test fixtures for backend tests.

Uses a dedicated test PostgreSQL database (crowbar_test) with
per-test table creation/teardown for full isolation.

Setup:
    docker compose exec postgres createdb -U postgres crowbar_test
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

# --------------------------------------------------------------------------- #
# Test database engine (mirrors main but targets the _test database)
# --------------------------------------------------------------------------- #
#
# This must run before any other app module is imported. The Redis event stream
# is keyed by database name, and app.core.events resolves that key once at
# import time — so the test run has to claim the test database first. Otherwise
# tests publish into the dev stream and the dev consumer later replays those
# events against tenants that only ever existed here.

TEST_DATABASE_URL = settings.database_url.replace(
    "/crowbar", "/crowbar_test"
)
settings.database_url = TEST_DATABASE_URL

from app.core.redis_client import close_redis  # noqa: E402
from app.database import get_db  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.models.base import Base  # noqa: E402

# Import all models so Base.metadata knows about every table
import app.models  # noqa: E402,F401

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    """Create all tables before each test, drop them after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # The application Redis client is process-global while pytest-asyncio uses
    # a fresh event loop for each test. Close it on the loop that created it so
    # later tests cannot inherit a connection bound to a closed loop.
    await close_redis()
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    """Provide a database session scoped to a single test."""
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncClient:
    """
    Async HTTP test client with the database dependency overridden
    so every request shares the same test session.
    """

    async def _override_get_db():
        try:
            yield db_session
            await db_session.commit()
        except Exception:
            await db_session.rollback()
            raise

    fastapi_app.dependency_overrides[get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=fastapi_app),
        base_url="http://test",
    ) as ac:
        yield ac

    fastapi_app.dependency_overrides.clear()


# --------------------------------------------------------------------------- #
# Auth helper
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    """Register a default business owner and return Authorization headers."""
    resp = await client.post(
        "/api/auth/register-business",
        json={
            "email": "testuser@example.com",
            "password": "password1234",
            "name": "Test User",
            "phone": "+4915112345678",
            "business_name": "Test Business",
            "business_slug": "test-business",
        },
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
