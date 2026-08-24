from pydantic import field_validator, model_validator
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

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.environment.lower() == "production" and (
            not self.ml_internal_token
            or len(self.ml_internal_token.encode("utf-8")) < 32
            or "not-for-production" in self.ml_internal_token
        ):
            raise ValueError(
                "Unsafe production configuration: ML_INTERNAL_TOKEN must be a secret of at least 32 bytes"
            )
        return self

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
