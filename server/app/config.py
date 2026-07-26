from pydantic import field_validator
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
    access_token_expire_minutes: int = 60
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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
