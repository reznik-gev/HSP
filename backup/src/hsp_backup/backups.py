"""Taking, deleting, listing and restoring backups (docs/0106)."""

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from packaging.version import InvalidVersion, Version

from hsp_backup.archive import Manifest, extract_verified, write_archive
from hsp_backup.config import MANUAL, PRE_UPGRADE, Config
from hsp_backup.metrics import BackupMetrics
from hsp_backup.names import BackupName, expired
from hsp_backup.postgres import DATABASES, Postgres
from hsp_backup.stores import Store, StoreError

log = logging.getLogger("hsp_backup")

#: The installation's files a backup holds with include_config; never secrets/ (docs/0106).
CONFIG_FILES = (".env", "backups.yml", "compose.yml")


class RestoreRefused(Exception):
    """The backup can't be restored onto this installation; the message says why."""


@dataclass(frozen=True)
class Plan:
    target: str
    keep: int | None  # None: never deleted automatically
    keep_days: int | None
    include_config: bool


def now_utc() -> datetime:
    return datetime.now(UTC)


@dataclass
class Backups:
    config: Config
    postgres: Postgres
    stores: Callable[[str], Store]  # target name -> its store
    hsp_version: str
    install_dir: Path
    metrics: BackupMetrics
    clock: Callable[[], datetime] = field(default=now_utc)

    def plan(self, schedule: str) -> Plan:
        """Where `schedule`'s backups go and how many are kept. Manual backups keep the last
        `manual.keep`; pre-upgrade ones stay until `hsp upgrade` succeeds (docs/0106)."""
        if schedule == MANUAL:
            return Plan(self.config.manual_target, self.config.manual_keep, None, True)
        if schedule == PRE_UPGRADE:
            return Plan(self.config.manual_target, None, None, True)
        s = self.config.schedule(schedule)
        return Plan(s.target, s.keep, s.keep_days, s.include_config)

    def take(self, schedule: str) -> BackupName:
        plan = self.plan(schedule)
        name = BackupName(self.clock().replace(microsecond=0), schedule)
        started = time.monotonic()
        try:
            with TemporaryDirectory(prefix="hsp-backup-") as tmp:
                members: dict[str, Path] = {}
                for db in DATABASES:
                    members[f"{db}.dump"] = Path(tmp) / f"{db}.dump"
                    self.postgres.dump(db, members[f"{db}.dump"])
                if plan.include_config:
                    for f in CONFIG_FILES:
                        if (self.install_dir / f).is_file():
                            members[f"config/{f}"] = self.install_dir / f
                archive = Path(tmp) / str(name)
                write_archive(
                    archive,
                    members,
                    hsp_version=self.hsp_version,
                    schema_revision=self.postgres.schema_revision(),
                    created=name.created,
                    schedule=schedule,
                )
                size = archive.stat().st_size
                self.stores(plan.target).put(archive, str(name))
        except Exception as exc:
            self.metrics.failed(schedule, self.clock())
            log.error("backup failed", extra={"schedule": schedule, "error": str(exc)})
            raise
        seconds = time.monotonic() - started
        self.metrics.succeeded(schedule, name.created, seconds, size)
        log.info(
            "backup written",
            extra={"schedule": schedule, "backup": str(name), "target": plan.target, "size": size},
        )
        if plan.keep is not None:
            self.prune(schedule, keep=plan.keep, keep_days=plan.keep_days)
        return name

    def prune(self, schedule: str, *, keep: int, keep_days: int | None = None) -> list[str]:
        """Delete `schedule`'s backups beyond what's kept. A failure is logged, not raised: the
        new backup is already safe, and the next run tries again."""
        store = self.stores(self.plan(schedule).target)
        try:
            found = [b for n in store.names() if (b := BackupName.parse(n))]
            gone = [
                str(b)
                for b in expired(found, schedule, keep=keep, keep_days=keep_days, now=self.clock())
            ]
            for name in gone:
                store.delete(name)
                log.info("old backup deleted", extra={"schedule": schedule, "backup": name})
        except Exception as exc:
            log.warning("old backups not deleted", extra={"schedule": schedule, "error": str(exc)})
            return []
        return gone

    def list(self) -> list[tuple[str, BackupName]]:
        """Every backup on every target, newest first, as (target, name)."""
        found = [
            (label, b)
            for label in self.config.targets
            for n in self.stores(label).names()
            if (b := BackupName.parse(n))
        ]
        return sorted(found, key=lambda t: t[1], reverse=True)

    def restore(self, name: str) -> Manifest:
        """Replace both databases with backup `name`, from whichever target holds it."""
        if BackupName.parse(name) is None:
            raise RestoreRefused(f"{name!r} isn't a backup name; `hsp backup list` shows them")
        holder, unreadable = self._holder_of(name)
        if holder is None:
            unread = f" (couldn't read {', '.join(unreadable)})" if unreadable else ""
            raise RestoreRefused(f"no target holds {name}{unread}")
        with TemporaryDirectory(prefix="hsp-restore-") as tmp:
            archive = Path(tmp) / name
            self.stores(holder).fetch(name, archive)
            files = Path(tmp) / "files"
            manifest = extract_verified(archive, files)
            refuse_newer(name, manifest.hsp_version, self.hsp_version)
            for db in DATABASES:
                self.postgres.restore(db, files / f"{db}.dump")
            log.info("backup restored", extra={"backup": name, "hsp_version": manifest.hsp_version})
        return manifest

    def _holder_of(self, name: str) -> tuple[str | None, tuple[str, ...]]:
        """The target holding backup `name`, looking at each in turn. A target that can't be read
        is skipped, so a broken offsite store doesn't stop a restore from a local one; the
        skipped ones are returned too, to name them if no target holds it."""
        unreadable: tuple[str, ...] = ()
        for label in self.config.targets:
            try:
                if name in self.stores(label).names():
                    return label, unreadable
            except StoreError:
                unreadable += (label,)
        return None, unreadable


def refuse_newer(name: str, made_by: str, installed: str) -> None:
    """A backup from a newer HSP may hold a schema this one can't run (docs/0106)."""
    try:
        newer = Version(made_by) > Version(installed)
    except InvalidVersion:
        newer = made_by != installed
    if newer:
        raise RestoreRefused(
            f"{name} was made by HSP {made_by}, newer than the installed {installed}: "
            f"upgrade to {made_by} first, then restore"
        )
