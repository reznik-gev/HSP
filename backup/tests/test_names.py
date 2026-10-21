"""Backup names, and which old backups are deleted (docs/0106)."""

from datetime import UTC, datetime, timedelta

from hsp_backup.names import BackupName, expired

NOW = datetime(2026, 10, 21, 12, 0, tzinfo=UTC)


def taken(days_ago: float, schedule: str) -> BackupName:
    return BackupName(NOW - timedelta(days=days_ago), schedule)


def test_a_name_says_when_and_by_which_schedule() -> None:
    name = BackupName(datetime(2026, 10, 21, 2, 30, 5, tzinfo=UTC), "nightly")
    assert str(name) == "hsp-20261021T023005Z-nightly.tar"
    assert BackupName.parse(str(name)) == name


def test_other_files_are_not_backups() -> None:
    for other in ("notes.txt", "hsp-20261021T023005Z-nightly.tar.partial", "hsp-latest.tar"):
        assert BackupName.parse(other) is None


def test_all_but_the_newest_are_deleted() -> None:
    nightly = [taken(d, "nightly") for d in range(10)]
    assert expired(nightly, "nightly", keep=7, now=NOW) == [
        taken(7, "nightly"),
        taken(8, "nightly"),
        taken(9, "nightly"),
    ]


def test_other_schedules_are_never_touched() -> None:
    backups = [taken(h / 24, "hourly") for h in range(30)] + [taken(7, "weekly")]
    gone = expired(backups, "hourly", keep=24, now=NOW)
    assert len(gone) == 6
    assert all(b.schedule == "hourly" for b in gone)


def test_keep_days_keeps_more_when_it_keeps_more() -> None:
    weekly = [taken(7 * w, "weekly") for w in range(20)]  # 0 to 133 days old
    gone = expired(weekly, "weekly", keep=8, keep_days=90, now=NOW)
    assert gone == [taken(7 * w, "weekly") for w in range(13, 20)]  # 91 days and older


def test_keep_wins_when_it_keeps_more() -> None:
    old = [taken(100 + d, "monthly") for d in range(5)]
    assert expired(old, "monthly", keep=3, keep_days=30, now=NOW) == old[3:]


def test_fewer_than_keep_deletes_nothing() -> None:
    assert expired([taken(1, "nightly")], "nightly", keep=7, now=NOW) == []
