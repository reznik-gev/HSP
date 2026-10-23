from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

import structlog
from packaging.version import InvalidVersion, Version

from hsp_backup.archive import Manifest, extract_verified
from hsp_backup.clock import now_utc
from hsp_backup.config import MANUAL, PRE_UPGRADE, BackupConfig
from hsp_backup.contents import dump_name, write_backup
from hsp_backup.metrics import BackupMetrics
from hsp_backup.names import KEEP_FOREVER, BackupName, expired
from hsp_backup.postgres import DATABASES, Postgres
from hsp_backup.stores.base import Store, StoreError

log = structlog.get_logger()


class RestoreRefused(Exception):
    pass


@dataclass(frozen=True)
class BackupPlan:
    target: str
    include_config: bool
    keep: int
    keep_days: int | None


@dataclass
class Backups:
    config: BackupConfig
    postgres: Postgres
    stores: Callable[[str], Store]  # target name -> its store
    hsp_version: str
    install_dir: Path
    metrics: BackupMetrics
    clock: Callable[[], datetime] = field(default=now_utc)

    def plan(self, schedule: str) -> BackupPlan:
        if schedule == MANUAL:
            return BackupPlan(
                self.config.manual_target, True, keep=self.config.manual_keep, keep_days=None
            )
        if schedule == PRE_UPGRADE:  # kept until `hsp upgrade` succeeds, which prunes them
            return BackupPlan(self.config.manual_target, True, keep=KEEP_FOREVER, keep_days=None)
        s = self.config.schedule(schedule)
        return BackupPlan(s.target, s.include_config, keep=s.keep, keep_days=s.keep_days)

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
        if plan.keep != KEEP_FOREVER:
            self.prune(schedule, keep=plan.keep, keep_days=plan.keep_days)
        return name

    def prune(self, schedule: str, *, keep: int, keep_days: int | None = None) -> list[str]:
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
        except Exception as exc:  # the new backup is already safe; the next run tries again
            log.warning("old backups not deleted", schedule=schedule, error=str(exc))
            return []
        return gone

    def list(self) -> list[tuple[str, BackupName]]:
        found = [
            (label, b)
            for label in self.config.targets
            for n in self.stores(label).names()
            if (b := BackupName.parse(n))
        ]
        return sorted(found, key=lambda t: t[1], reverse=True)

    def restore(self, name: str) -> Manifest:
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
        unreadable: tuple[str, ...] = ()
        for label in self.config.targets:
            try:
                if name in self.stores(label).names():
                    return label, unreadable
            except StoreError:  # a broken offsite store mustn't stop a restore from a local one
                unreadable += (label,)
        return None, unreadable


def refuse_newer(name: str, made_by: str, installed: str) -> None:
    try:
        newer = Version(made_by) > Version(installed)
    except InvalidVersion:
        newer = made_by != installed
    if newer:
        raise RestoreRefused(
            f"{name} was made by HSP {made_by}, newer than the installed {installed}: "
            f"upgrade to {made_by} first, then restore"
        )
