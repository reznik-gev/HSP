"""Application settings, read from environment variables prefixed with ``MUSICAL_CHAIRS_``."""

import base64
from functools import lru_cache
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, PostgresDsn, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import make_url

# Fixed, publicly known key used ONLY when MUSICAL_CHAIRS_ENVIRONMENT=development, so dev sessions
# survive API reloads. Any other environment must set MUSICAL_CHAIRS_SESSION_ENCRYPTION_KEY
# (docs/0077).
DEV_SESSION_ENCRYPTION_KEY = base64.urlsafe_b64encode(
    b"musical-chairs-dev-only-sessions"  # exactly 32 bytes, as Fernet needs
)

#: Where Docker puts secret files by default (docs/0099). A setting can come from a file named
#: after its variable in lower case, e.g. /run/secrets/musical_chairs_oidc_client_secret; the
#: environment wins.
DEFAULT_SECRETS_DIR = Path("/run/secrets")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MUSICAL_CHAIRS_",
        env_file=".env",
        extra="ignore",
        secrets_dir=DEFAULT_SECRETS_DIR if DEFAULT_SECRETS_DIR.is_dir() else None,
    )

    environment: Literal["development", "test", "production"] = "development"
    database_url: PostgresDsn = Field(
        default=PostgresDsn(
            "postgresql+asyncpg://musical_chairs:musical_chairs@localhost:5432/musical_chairs"
        ),
    )
    # Overrides the URL's password, so the URL can be plain config and the password a secret
    # file (docs/0099).
    database_password: SecretStr | None = None
    log_level: str = "INFO"
    log_json: bool = True

    # Origin users browse to; redirect URIs are built from it (docs/0077).
    public_url: str = "http://localhost:5173"

    # OIDC / Keycloak (docs/0008, docs/0038, docs/0077)
    oidc_issuer_url: str = "http://localhost:8080/auth/realms/musical_chairs"
    oidc_client_id: str = "musical-chairs-api"
    oidc_client_secret: SecretStr = SecretStr("dev-secret-change-me")
    oidc_scopes: str = "openid profile email"
    # Allowed clock skew when validating ID tokens.
    oidc_leeway_s: int = 60

    # Sessions (docs/0077)
    session_cookie_name: str = "musical_chairs_session"
    # Short-lived cookie carrying state/nonce/PKCE verifier between /login and /callback.
    login_cookie_name: str = "musical_chairs_login"
    login_max_age_s: int = 600
    session_encryption_key: SecretStr | None = None
    # Refresh the access token when it expires within this many seconds.
    access_token_refresh_margin_s: int = 30

    # Floor edit lock (docs/0016): expires unless the editor sends heartbeats.
    edit_lock_ttl_s: int = 900

    @property
    def database_dsn(self) -> str:
        """The database URL to connect with, including `database_password` if it's set."""
        url = make_url(str(self.database_url))
        if self.database_password is not None:
            url = url.set(password=self.database_password.get_secret_value())
        return url.render_as_string(hide_password=False)

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def oidc_redirect_uri(self) -> str:
        return f"{self.public_url.rstrip('/')}/api/v1/auth/callback"

    @property
    def session_cookie_secure(self) -> bool:
        """Secure cookies everywhere except plain-http localhost development."""
        return not (self.is_development and self.public_url.startswith("http://"))

    def session_key(self) -> bytes:
        if self.session_encryption_key is not None:
            return self.session_encryption_key.get_secret_value().encode()
        if self.is_development:
            return DEV_SESSION_ENCRYPTION_KEY
        raise RuntimeError("MUSICAL_CHAIRS_SESSION_ENCRYPTION_KEY is required outside development")

    @model_validator(mode="after")
    def _require_real_secrets_outside_development(self) -> Self:
        if self.environment == "production":
            missing = []
            if self.session_encryption_key is None:
                missing.append("MUSICAL_CHAIRS_SESSION_ENCRYPTION_KEY")
            if self.oidc_client_secret.get_secret_value() in ("", "dev-secret-change-me"):
                missing.append("MUSICAL_CHAIRS_OIDC_CLIENT_SECRET")
            if missing:
                raise ValueError(f"production requires: {', '.join(missing)}")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
