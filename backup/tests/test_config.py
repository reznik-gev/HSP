"""backups.yml: what's accepted, and what's refused with a message that says where (docs/0106)."""

from pathlib import Path

import pytest

from hsp_backup.config import ConfigError, FolderTarget, S3Target, load_config, parse_config

FULL = """
timezone: Asia/Jerusalem
targets:
  local: { type: folder, path: /backups }
  offsite:
    type: s3
    endpoint: https://minio.corp:9000
    bucket: hsp-backups
    prefix: prod/
    path_style: true
    ca_file: /etc/hsp/backup-ca.pem
schedules:
  - { name: nightly, cron: "30 2 * * *", target: local, keep: 7 }
  - { name: weekly, cron: "0 4 * * 0", target: offsite, keep: 8, keep_days: 90,
      include_config: true }
manual: { target: local, keep: 3 }
"""

ONE_TARGET = """
targets:
  local: { type: folder, path: /backups }
"""


def refused(text: str) -> str:
    with pytest.raises(ConfigError) as caught:
        parse_config(text)
    return str(caught.value)


def test_a_full_file_is_read() -> None:
    config = parse_config(FULL)
    assert config.timezone == "Asia/Jerusalem"
    assert config.targets["local"] == FolderTarget(type="folder", path=Path("/backups"))
    offsite = config.targets["offsite"]
    assert isinstance(offsite, S3Target)
    assert (offsite.bucket, offsite.prefix, offsite.path_style) == ("hsp-backups", "prod/", True)
    assert offsite.region == "us-east-1"
    assert [s.name for s in config.schedules] == ["nightly", "weekly"]
    weekly = config.schedule("weekly")
    assert (weekly.keep, weekly.keep_days, weekly.include_config) == (8, 90, True)
    assert (config.manual_target, config.manual_keep) == ("local", 3)


def test_without_schedules_manual_backups_go_to_the_first_target() -> None:
    config = parse_config(ONE_TARGET)
    assert config.schedules == []
    assert (config.manual_target, config.manual_keep) == ("local", 5)
    assert config.timezone == "UTC"


def test_a_schedule_must_use_a_named_target() -> None:
    message = refused(
        ONE_TARGET + 'schedules: [{name: n, cron: "0 2 * * *", target: nas, keep: 1}]'
    )
    assert "schedule 'n' uses target 'nas', which isn't under targets" in message


def test_a_bad_cron_is_named() -> None:
    message = refused(ONE_TARGET + 'schedules: [{name: n, cron: "at 2", target: local, keep: 1}]')
    assert "schedules.0.cron" in message
    assert "not a cron expression: 'at 2'" in message


def test_keep_must_be_at_least_one() -> None:
    message = refused(
        ONE_TARGET + 'schedules: [{name: n, cron: "0 2 * * *", target: local, keep: 0}]'
    )
    assert "schedules.0.keep" in message


def test_schedule_names_are_simple_unique_and_not_reserved() -> None:
    line = '  - {{name: {}, cron: "0 2 * * *", target: local, keep: 1}}\n'
    assert "lower-case" in refused(ONE_TARGET + "schedules:\n" + line.format("Night ly"))
    assert "reserved" in refused(ONE_TARGET + "schedules:\n" + line.format("manual"))
    twice = ONE_TARGET + "schedules:\n" + line.format("n") + line.format("n")
    assert "schedule names must be unique: n" in refused(twice)


def test_unknown_settings_are_refused() -> None:
    message = refused("targets:\n  local: { type: folder, pth: /b }")
    assert "targets.local.folder.pth: Extra inputs are not permitted" in message


def test_an_unknown_target_type_is_refused() -> None:
    assert "targets.local" in refused("targets:\n  local: { type: ftp, path: /b }")


def test_an_unknown_time_zone_is_refused() -> None:
    assert "unknown time zone: 'Mars/Base'" in refused("timezone: Mars/Base\n" + ONE_TARGET)


def test_at_least_one_target() -> None:
    assert "name at least one target" in refused("targets: {}")


def test_not_yaml_is_refused() -> None:
    assert "isn't valid YAML" in refused("targets: [")


def test_a_missing_file_is_named(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match=r"can't read .*backups\.yml"):
        load_config(tmp_path / "backups.yml")
