import pytest

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


def _production_settings(**overrides):
    values = {
        "environment": "production",
        "database_url": "postgresql://crowbar:secret@db.internal:5432/crowbar",
        "redis_url": "redis://redis.internal:6379/0",
        "frontend_url": "https://crowbar.example",
        "cors_origins": ["https://crowbar.example"],
        "ml_service_url": "http://ml.internal:8001",
        "ml_internal_token": "m" * 48,
        "secret_key": "s" * 48,
        "public_link_secret_key": "p" * 48,
        "table_qr_secret_key": "q" * 48,
        "rate_limit_hmac_secret": "r" * 48,
        "rate_limit_enabled": True,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_production_accepts_explicit_separated_secrets():
    settings = _production_settings()

    assert settings.environment == "production"
    assert settings.secret_key != settings.public_link_secret_key
    assert settings.public_link_secret_key != settings.table_qr_secret_key


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("secret_key", "your-secret-key-change-in-production"),
        ("public_link_secret_key", "development-public-link-secret-not-for-production"),
        ("table_qr_secret_key", "development-table-qr-secret-not-for-production"),
        ("rate_limit_hmac_secret", "development-rate-limit-secret-not-for-production"),
        ("ml_internal_token", None),
    ],
)
def test_production_rejects_missing_or_weak_security_values(field, value):
    with pytest.raises(ValueError, match=field.upper()):
        _production_settings(**{field: value})


def test_production_requires_rate_limiting():
    with pytest.raises(ValueError, match="RATE_LIMIT_ENABLED"):
        _production_settings(rate_limit_enabled=False)


@pytest.mark.parametrize(
    "origins",
    [[], ["*"], ["http://localhost:3000"]],
)
def test_production_rejects_unsafe_cors(origins):
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        _production_settings(cors_origins=origins)


def test_production_requires_frontend_origin_in_cors_allowlist():
    with pytest.raises(ValueError, match="include FRONTEND_URL"):
        _production_settings(cors_origins=["https://staff.crowbar.example"])
