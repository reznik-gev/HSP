from datetime import timedelta

from github_app_token import cache
from github_app_token.config import Config

from .conftest import NOW, TOKEN_LIFETIME, FakeGitHub

STILL_FRESH = NOW + TOKEN_LIFETIME - timedelta(minutes=11)
NEARLY_EXPIRED = NOW + TOKEN_LIFETIME - timedelta(minutes=9)


def test_a_first_call_mints_a_token_and_writes_it_for_gh(
    cfg: Config, fake_github: FakeGitHub
) -> None:
    state = cache.current(cfg, NOW, fake_github)

    assert state.token == "ghs_token1"
    assert state.bot_login == "reznik-gev-claude[bot]"
    assert state.reaches("reznik-gev", "hsp")
    hosts = (cfg.gh_config_dir / "hosts.yml").read_text(encoding="utf-8")
    assert "oauth_token: ghs_token1" in hosts
    assert "user: reznik-gev-claude[bot]" in hosts


def test_a_token_with_more_than_ten_minutes_left_is_reused(
    cfg: Config, fake_github: FakeGitHub
) -> None:
    cache.current(cfg, NOW, fake_github)

    state = cache.current(cfg, STILL_FRESH, fake_github)

    assert state.token == "ghs_token1"
    assert fake_github.minted == ["ghs_token1"]


def test_a_token_with_less_than_ten_minutes_left_is_renewed(
    cfg: Config, fake_github: FakeGitHub
) -> None:
    cache.current(cfg, NOW, fake_github)

    state = cache.current(cfg, NEARLY_EXPIRED, fake_github)

    assert state.token == "ghs_token2"
    assert "oauth_token: ghs_token2" in (cfg.gh_config_dir / "hosts.yml").read_text("utf-8")


def test_a_damaged_state_file_is_replaced_with_a_new_token(
    cfg: Config, fake_github: FakeGitHub
) -> None:
    cfg.gh_config_dir.mkdir(parents=True)
    (cfg.gh_config_dir / cache.STATE_FILE).write_text("{not json", encoding="utf-8")

    state = cache.current(cfg, NOW, fake_github)

    assert state.token == "ghs_token1"
