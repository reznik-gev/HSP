"""Logs are JSON lines on stderr, like the API's (docs/0057)."""

import json
from collections.abc import Iterator

import pytest
import structlog

from hsp_backup.logs import configure_logging


@pytest.fixture
def configured() -> Iterator[None]:
    configure_logging()
    yield
    structlog.reset_defaults()


@pytest.mark.usefixtures("configured")
def test_logs_are_json_lines_on_stderr(capsys: pytest.CaptureFixture[str]) -> None:
    structlog.get_logger().info("backup written", schedule="nightly")
    out, err = capsys.readouterr()
    line = json.loads(err)
    assert (line["level"], line["event"], line["schedule"]) == ("info", "backup written", "nightly")
    assert out == ""
