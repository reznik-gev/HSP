"""Taking, deleting, listing and restoring backups (docs/0106)."""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory

import structlog
from packaging.version import InvalidVersion, Version

from hsp_backup.archive import Manifest, extract_verified
from hsp_backup.config import MANUAL, PRE_UPGRADE, BackupConfig
from hsp_backup.contents import dump_name, write_backup
from hsp_backup.metrics import BackupMetrics
from hsp_backup.names import BackupName, expired
from hsp_backup.postgres import DATABASES, Postgres
from hsp_backup.stores.base import Store, StoreError

log = structlog.get_logger()


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
    config: BackupConfig
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
        name = BackupName.at(self.clock(), schedule)
        with (
            self.metrics.measure(schedule, name.created) as run,
            TemporaryDirectory(prefix="hsp-backup-") as tmp,
        ):
            archive = write_backup(
                name,
                Path(tmp),
                postgres=self.postgres,
                hsp_version=self.hsp_version,
                config_from=self.install_dir if plan.include_config else None,
            )
            run.size = archive.stat().st_size
            self.stores(plan.target).put(archive, str(name))
        log.info(
            "backup written",
            schedule=schedule,
            backup=str(name),
            target=plan.target,
            size=run.size,
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
                log.info("old backup deleted", schedule=schedule, backup=name)
        except Exception as exc:
            log.warning("old backups not deleted", schedule=schedule, error=str(exc))
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
                self.postgres.restore(db, files / dump_name(db))
            log.info("backup restored", backup=name, hsp_version=manifest.hsp_version)
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
