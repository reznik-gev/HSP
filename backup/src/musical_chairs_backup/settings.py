from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class BackupSettings(BaseSettings):
    # Each variable is named in full: some are PostgreSQL's own, so there's no common prefix.
    model_config = SettingsConfigDict(frozen=True)

    config: Path = Field(
        Path("/etc/musical_chairs/backups.yml"), alias="MUSICAL_CHAIRS_BACKUP_CONFIG"
    )
    #: Where .env, backups.yml and compose.yml are, for include_config.
    install_dir: Path = Field(
        Path("/etc/musical_chairs/install"), alias="MUSICAL_CHAIRS_BACKUP_INSTALL_DIR"
    )
    musical_chairs_version: str = Field("0.0.0-dev", alias="MUSICAL_CHAIRS_VERSION")
    pg_host: str = Field("postgres", alias="PGHOST")
    pg_user: str = Field("postgres", alias="PGUSER")
    pg_password_file: Path = Field(
        Path("/run/secrets/db_superuser_password"), alias="PGPASSWORD_FILE"
    )
    #: Where the S3 targets' key files are.
    secrets_dir: Path = Field(Path("/run/secrets"), alias="MUSICAL_CHAIRS_BACKUP_SECRETS_DIR")
