import re
from pathlib import Path
from typing import Annotated, Any, Literal, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import yaml
from croniter import croniter
from pydantic import Field, ValidationError, field_validator, model_validator

from hsp_backup.names import DEFAULT_KEEP, DEFAULT_KEEP_DAYS
from hsp_backup.strict_model import StrictModel

#: Schedule names go into file names, so they're kept simple.
NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")
#: Names hsp-backup gives its own backups; schedules can't use them.
MANUAL = "manual"
PRE_UPGRADE = "pre-upgrade"
RESERVED = frozenset({MANUAL, PRE_UPGRADE})


class ConfigError(Exception):
    pass


class FolderTarget(StrictModel):
    type: Literal["folder"]
    path: Path


class S3Target(StrictModel):
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


class BackupSchedule(StrictModel):
    name: str
    cron: str
    target: str
    keep: int = Field(default=DEFAULT_KEEP, ge=1)
    keep_days: int | None = Field(default=None, ge=1)
    include_config: bool = False

    @model_validator(mode="before")
    @classmethod
    def _keep_a_week_unless_told(cls, data: Any) -> Any:
        if isinstance(data, dict) and "keep" not in data and "keep_days" not in data:
            return {**data, "keep_days": DEFAULT_KEEP_DAYS}
        return data

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


class Manual(StrictModel):
    target: str
    keep: int = Field(default=5, ge=1)


class BackupConfig(StrictModel):
    timezone: str = "UTC"
    targets: dict[str, Target]
    schedules: list[BackupSchedule] = Field(default_factory=list)
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
        return self.manual.target if self.manual else next(iter(self.targets))

    @property
    def manual_keep(self) -> int:
        return self.manual.keep if self.manual else Manual(target="").keep

    def schedule(self, name: str) -> BackupSchedule:
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
