"""Where hsp-backup finds its files and PostgreSQL: environment variables, listed in
backup/README.md. The schedules and targets are in backups.yml (config.py)."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class BackupSettings(BaseSettings):
    # Each variable is named in full: some are PostgreSQL's own, so there's no common prefix.
    model_config = SettingsConfigDict(frozen=True)

    config: Path = Field(Path("/etc/hsp/backups.yml"), alias="HSP_BACKUP_CONFIG")
    #: Where .env, backups.yml and compose.yml are, for include_config.
    install_dir: Path = Field(Path("/etc/hsp/install"), alias="HSP_BACKUP_INSTALL_DIR")
    hsp_version: str = Field("0.0.0-dev", alias="HSP_VERSION")
    pg_host: str = Field("postgres", alias="PGHOST")
    pg_user: str = Field("postgres", alias="PGUSER")
    pg_password_file: Path = Field(
        Path("/run/secrets/db_superuser_password"), alias="PGPASSWORD_FILE"
    )
    #: Where the S3 targets' key files are.
    secrets_dir: Path = Field(Path("/run/secrets"), alias="HSP_BACKUP_SECRETS_DIR")
