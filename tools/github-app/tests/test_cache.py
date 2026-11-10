from datetime import timedelta
from pathlib import Path

import pytest

from github_app_token import cache
from github_app_token.config import Config

from .conftest import NOW, TOKEN_LIFETIME, SpyGitHub

STILL_FRESH = NOW + TOKEN_LIFETIME - timedelta(minutes=11)
NEARLY_EXPIRED = NOW + TOKEN_LIFETIME - timedelta(minutes=9)
DAMAGED_STATE = "{not json"


@pytest.fixture
def damaged_state_file(cfg: Config) -> Path:
    path = cfg.gh_config_dir / cache.STATE_FILE
    path.parent.mkdir(parents=True)
    path.write_text(DAMAGED_STATE, encoding="utf-8")
    return path


def test_a_first_call_mints_a_token_and_writes_it_for_gh(
    cfg: Config, spy_github: SpyGitHub
) -> None:
    state = cache.current(cfg, NOW, spy_github)

    assert state.token == "ghs_token1"
    assert state.bot_login == "reznik-gev-claude[bot]"
    assert state.reaches("reznik-gev", "hsp")
    hosts = (cfg.gh_config_dir / "hosts.yml").read_text(encoding="utf-8")
    assert "oauth_token: ghs_token1" in hosts
    assert "user: reznik-gev-claude[bot]" in hosts


@pytest.mark.usefixtures("saved_token")
def test_a_token_with_more_than_ten_minutes_left_is_reused(
    cfg: Config, spy_github: SpyGitHub
) -> None:
    state = cache.current(cfg, STILL_FRESH, spy_github)

    assert state.token == "ghs_token1"
    assert spy_github.minted == ["ghs_token1"]


@pytest.mark.usefixtures("saved_token")
def test_a_token_with_less_than_ten_minutes_left_is_renewed(
    cfg: Config, spy_github: SpyGitHub
) -> None:
    state = cache.current(cfg, NEARLY_EXPIRED, spy_github)

    assert state.token == "ghs_token2"
    assert "oauth_token: ghs_token2" in (cfg.gh_config_dir / "hosts.yml").read_text("utf-8")


@pytest.mark.usefixtures("damaged_state_file")
def test_a_damaged_state_file_is_replaced_with_a_new_token(
    cfg: Config, spy_github: SpyGitHub
) -> None:
    state = cache.current(cfg, NOW, spy_github)

    assert state.token == "ghs_token1"
