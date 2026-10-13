from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Tia Julia API"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str
    timezone: str = "America/Lima"
    cors_origins: str = "http://localhost:5173"
    ml_model_dir: str = "./models"
    report_output_dir: str = "./generated_reports"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def sqlalchemy_database_uri(self) -> str:
        url = self.database_url
        if url.startswith("postgresql+psycopg://"):
            return url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def model_dir_path(self) -> Path:
        path = Path(self.ml_model_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def report_dir_path(self) -> Path:
        path = Path(self.report_output_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
