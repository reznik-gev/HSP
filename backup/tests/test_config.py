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


def schedule(name: str = "n", cron: str = "0 2 * * *", target: str = "local", keep: int = 1) -> str:
    return f'  - {{ name: "{name}", cron: "{cron}", target: {target}, keep: {keep} }}\n'


#: Bad files, each with what the refusal must say.
REFUSED = [
    pytest.param(
        ONE_TARGET + "schedules:\n" + schedule(target="nas"),
        ("schedule 'n' uses target 'nas', which isn't under targets",),
        id="unknown-target",
    ),
    pytest.param(
        ONE_TARGET + "schedules:\n" + schedule(cron="at 2"),
        ("schedules.0.cron", "not a cron expression: 'at 2'"),
        id="bad-cron",
    ),
    pytest.param(
        ONE_TARGET + "schedules:\n" + schedule(keep=0), ("schedules.0.keep",), id="keep-zero"
    ),
    pytest.param(
        ONE_TARGET + "schedules:\n" + schedule(name="Night ly"), ("lower-case",), id="name-spaces"
    ),
    pytest.param(
        ONE_TARGET + "schedules:\n" + schedule(name="manual"), ("reserved",), id="reserved-name"
    ),
    pytest.param(
        ONE_TARGET + "schedules:\n" + schedule() + schedule(),
        ("schedule names must be unique: n",),
        id="duplicate-names",
    ),
    pytest.param(
        "targets:\n  local: { type: folder, pth: /b }",
        ("targets.local.folder.pth: Extra inputs are not permitted",),
        id="misspelt-setting",
    ),
    pytest.param("targets:\n  local: { type: ftp, path: /b }", ("targets.local",), id="ftp"),
    pytest.param(
        "timezone: Mars/Base\n" + ONE_TARGET, ("unknown time zone: 'Mars/Base'",), id="time-zone"
    ),
    pytest.param("targets: {}", ("name at least one target",), id="no-targets"),
    pytest.param("targets: [", ("isn't valid YAML",), id="not-yaml"),
]


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


@pytest.mark.parametrize(("text", "messages"), REFUSED, ids=[case.id for case in REFUSED])
def test_a_bad_file_is_refused_saying_where(text: str, messages: tuple[str, ...]) -> None:
    message = refused(text)
    for expected in messages:
        assert expected in message


def test_a_missing_file_is_named(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match=r"can't read .*backups\.yml"):
        load_config(tmp_path / "backups.yml")
