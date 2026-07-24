from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database (read-only access to the main app DB)
    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/crowbar"
    )
    database_url_sync: str = (
        "postgresql://postgres:postgres@localhost:5432/crowbar"
    )

    # Environment
    environment: str = "development"
    log_level: str = "INFO"
    ml_internal_token: str | None = None

    # MLflow
    mlflow_tracking_uri: str = "sqlite:///mlflow.db"

    @field_validator("database_url")
    @classmethod
    def normalize_async_database_url(cls, value: str) -> str:
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+asyncpg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

    @field_validator("database_url_sync")
    @classmethod
    def normalize_sync_database_url(cls, value: str) -> str:
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql://", 1)
        if value.startswith("postgresql+asyncpg://"):
            return value.replace("postgresql+asyncpg://", "postgresql://", 1)
        return value

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
