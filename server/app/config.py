from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/crowbar"
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Application-level abuse controls
    rate_limit_enabled: bool = False

    # Private ML service
    ml_service_url: str = "http://localhost:8001"
    ml_internal_token: str | None = None

    # Auth
    secret_key: str = "your-secret-key-change-in-production"
    public_link_secret_key: str = "development-public-link-secret-not-for-production"
    table_qr_secret_key: str = "development-table-qr-secret-not-for-production"
    rate_limit_hmac_secret: str = "development-rate-limit-secret-not-for-production"
    access_token_expire_minutes: int = 60
    table_guest_session_ttl_minutes: int = Field(default=12 * 60, ge=30, le=24 * 60)
    algorithm: str = "HS256"

    # Environment
    environment: str = "development"

    # Storage
    storage_type: str = "local"
    upload_dir: str = "uploads"

    # Email (Resend)
    resend_api_key: str | None = None
    email_from_address: str = "onboarding@resend.dev"
    email_from_name: str = "Crowbar"

    frontend_url: str = "http://localhost:3000"

    # Twilio SMS
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("database_url")
    @classmethod
    def normalize_async_database_url(cls, value: str) -> str:
        """Accept provider-standard Postgres URLs with the async engine."""
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+asyncpg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.environment.lower() != "production":
            return self

        errors: list[str] = []
        required_secrets = {
            "SECRET_KEY": self.secret_key,
            "PUBLIC_LINK_SECRET_KEY": self.public_link_secret_key,
            "TABLE_QR_SECRET_KEY": self.table_qr_secret_key,
            "RATE_LIMIT_HMAC_SECRET": self.rate_limit_hmac_secret,
            "ML_INTERNAL_TOKEN": self.ml_internal_token,
        }
        development_defaults = {
            "your-secret-key-change-in-production",
            "development-public-link-secret-not-for-production",
            "development-table-qr-secret-not-for-production",
            "development-rate-limit-secret-not-for-production",
        }
        for name, value in required_secrets.items():
            if (
                not value
                or len(value.encode("utf-8")) < 32
                or value in development_defaults
                or "change-in-production" in value
                or "not-for-production" in value
            ):
                errors.append(f"{name} must be a unique secret of at least 32 bytes")

        distinct = [value for value in required_secrets.values() if value]
        if len(distinct) != len(set(distinct)):
            errors.append("Production signing and internal-service secrets must be distinct")
        if not self.rate_limit_enabled:
            errors.append("RATE_LIMIT_ENABLED must be true in production")
        if (
            not self.cors_origins
            or "*" in self.cors_origins
            or any(not origin.startswith("https://") for origin in self.cors_origins)
        ):
            errors.append("CORS_ORIGINS must contain explicit HTTPS production origins")
        if not self.frontend_url.startswith("https://"):
            errors.append("FRONTEND_URL must be an explicit HTTPS production origin")
        elif self.frontend_url.rstrip("/") not in {
            origin.rstrip("/") for origin in self.cors_origins
        }:
            errors.append("CORS_ORIGINS must include FRONTEND_URL")

        if errors:
            raise ValueError("Unsafe production configuration: " + "; ".join(errors))
        return self

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
