"""Application settings, read from environment variables prefixed with ``HSP_``."""

from functools import lru_cache

from pydantic import Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HSP_", env_file=".env", extra="ignore")

    environment: str = Field(default="development", description="development | test | production")
    database_url: PostgresDsn = Field(
        default=PostgresDsn("postgresql+asyncpg://hsp:hsp@localhost:5432/hsp"),
    )
    log_level: str = "INFO"
    log_json: bool = True

    # OIDC / Keycloak (docs/0008, docs/0038)
    oidc_issuer_url: str = "http://localhost:8080/auth/realms/hsp"
    oidc_client_id: str = "hsp-api"
    oidc_client_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
