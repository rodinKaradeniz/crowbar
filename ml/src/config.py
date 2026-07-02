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

    # MLflow
    mlflow_tracking_uri: str = "sqlite:///mlflow.db"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
