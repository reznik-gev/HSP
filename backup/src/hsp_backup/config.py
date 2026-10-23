"""`backups.yml`: named targets and a list of schedules (docs/0106).

timezone: Asia/Jerusalem
targets:
  local:   { type: folder, path: /backups }
  offsite: { type: s3, endpoint: https://minio.corp:9000, bucket: hsp-backups, prefix: prod/ }
schedules:
  - { name: nightly, cron: "30 2 * * *", target: local, keep: 7 }
manual: { target: local, keep: 5 }
"""

import re
from pathlib import Path
from typing import Annotated, Literal, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import yaml
from croniter import croniter
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

#: Schedule names go into file names, so they're kept simple.
NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")
#: Names hsp-backup gives its own backups; schedules can't use them.
MANUAL = "manual"
PRE_UPGRADE = "pre-upgrade"
RESERVED = frozenset({MANUAL, PRE_UPGRADE})


class ConfigError(Exception):
    """`backups.yml` is missing or wrong; the message says where and how."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class FolderTarget(_Strict):
    type: Literal["folder"]
    path: Path


class S3Target(_Strict):
    type: Literal["s3"]
    bucket: str
    #: Empty for AWS itself; the URL of MinIO or another S3-compatible store otherwise.
    endpoint: str | None = None
    prefix: str = ""
    region: str = "us-east-1"
    #: bucket in the path (MinIO) instead of in the host name.
    path_style: bool = False
    #: A CA bundle for endpoints with an internal certificate authority.
    ca_file: Path | None = None


Target = Annotated[FolderTarget | S3Target, Field(discriminator="type")]


class Schedule(_Strict):
    name: str
    cron: str
    target: str
    keep: int = Field(ge=1)
    keep_days: int | None = Field(default=None, ge=1)
    include_config: bool = False

    @field_validator("name")
    @classmethod
    def _simple_name(cls, name: str) -> str:
        if not NAME.match(name):
            raise ValueError("use lower-case letters, digits and dashes")
        if name in RESERVED:
            raise ValueError(f"{name!r} is reserved for hsp-backup's own backups")
        return name

    @field_validator("cron")
    @classmethod
    def _valid_cron(cls, cron: str) -> str:
        if not croniter.is_valid(cron):
            raise ValueError(f"not a cron expression: {cron!r}")
        return cron


class Manual(_Strict):
    """Backups taken by `hsp backup now`, and before upgrades."""

    target: str
    keep: int = Field(default=5, ge=1)


class BackupConfig(_Strict):
    timezone: str = "UTC"
    targets: dict[str, Target]
    schedules: list[Schedule] = []
    manual: Manual | None = None

    @field_validator("timezone")
    @classmethod
    def _known_zone(cls, zone: str) -> str:
        try:
            ZoneInfo(zone)
        except ZoneInfoNotFoundError, ValueError:
            raise ValueError(f"unknown time zone: {zone!r}") from None
        return zone

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if not self.targets:
            raise ValueError("name at least one target")
        names = [s.name for s in self.schedules]
        if dupes := sorted({n for n in names if names.count(n) > 1}):
            raise ValueError(f"schedule names must be unique: {', '.join(dupes)}")
        used = [(f"schedule {s.name!r}", s.target) for s in self.schedules]
        if self.manual:
            used.append(("manual", self.manual.target))
        for who, target in used:
            if target not in self.targets:
                raise ValueError(f"{who} uses target {target!r}, which isn't under targets")
        return self

    @property
    def manual_target(self) -> str:
        """Where manual and pre-upgrade backups go: as set, or the first target."""
        return self.manual.target if self.manual else next(iter(self.targets))

    @property
    def manual_keep(self) -> int:
        return self.manual.keep if self.manual else Manual(target="").keep

    def schedule(self, name: str) -> Schedule:
        for s in self.schedules:
            if s.name == name:
                return s
        raise ConfigError(f"no schedule named {name!r} in backups.yml")


def _where(loc: tuple[int | str, ...]) -> str:
    return ".".join(str(part) for part in loc) or "backups.yml"


def parse_config(text: str) -> BackupConfig:
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ConfigError(f"backups.yml isn't valid YAML: {exc}") from None
    try:
        return BackupConfig.model_validate(data)
    except ValidationError as exc:
        problems = [f"{_where(e['loc'])}: {e['msg']}" for e in exc.errors()]
        raise ConfigError("backups.yml has problems:\n  " + "\n  ".join(problems)) from None


def load_config(path: Path) -> BackupConfig:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ConfigError(f"can't read {path}: {exc.strerror}") from None
    return parse_config(text)
