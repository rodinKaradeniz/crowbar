from app.config import Settings


def test_normalizes_standard_postgresql_url_for_asyncpg():
    settings = Settings(
        database_url="postgresql://user:pass@postgres:5432/crowbar"
    )

    assert (
        settings.database_url
        == "postgresql+asyncpg://user:pass@postgres:5432/crowbar"
    )


def test_preserves_explicit_asyncpg_url():
    url = "postgresql+asyncpg://user:pass@postgres:5432/crowbar"

    assert Settings(database_url=url).database_url == url
