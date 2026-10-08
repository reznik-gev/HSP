"""Application settings, read from environment variables prefixed with ``HSM_``."""

from functools import lru_cache

from pydantic import Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HSM_", env_file=".env", extra="ignore")

    environment: str = Field(default="development", description="development | test | production")
    database_url: PostgresDsn = Field(
        default=PostgresDsn("postgresql+asyncpg://hsm:hsm@localhost:5432/hsm"),
    )
    log_level: str = "INFO"
    log_json: bool = True

    # OIDC / Keycloak (docs/0008, docs/0038)
    oidc_issuer_url: str = "http://localhost:8080/auth/realms/hsm"
    oidc_client_id: str = "hsm-api"
    oidc_client_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
