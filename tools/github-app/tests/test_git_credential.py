import io

import pytest

from github_app_token import cache, cli
from github_app_token.config import Config

from .conftest import INSTALL_URL, NOW, SpyGitHub

HSP = "protocol=https\nhost=github.com\npath=reznik-gev/HSP.git\n\n"
NOT_INSTALLED = "protocol=https\nhost=github.com\npath=reznik-gev/other.git\n\n"
OTHER_ACCOUNT = "protocol=https\nhost=github.com\npath=someone-else/tool.git\n\n"
NO_PATH = "protocol=https\nhost=github.com\n\n"
OTHER_HOST = "protocol=https\nhost=gitlab.com\npath=reznik-gev/HSP.git\n\n"
ANSWER = "username=x-access-token\npassword=ghs_token1\n"
JUST_INSTALLED = "reznik-gev/other"


@pytest.fixture
def installed_a_moment_ago(saved_token: cache.State, spy_github: SpyGitHub) -> SpyGitHub:
    """The owner installs the App on one more repository after the token was saved."""
    spy_github.installed.append(JUST_INSTALLED)
    return spy_github


def ask(cfg: Config, spy_github: SpyGitHub, request: str, action: str = "get") -> str:
    stdout = io.StringIO()
    cli.git_credential(cfg, action, io.StringIO(request), stdout, lambda: NOW, spy_github)
    return stdout.getvalue()


def test_a_repository_the_app_is_installed_on_gets_the_apps_token(
    cfg: Config, spy_github: SpyGitHub
) -> None:
    assert ask(cfg, spy_github, HSP) == ANSWER


def test_the_owners_repository_without_the_app_is_refused_with_the_install_link(
    cfg: Config, spy_github: SpyGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    assert ask(cfg, spy_github, NOT_INSTALLED) == "quit=1\n"
    assert INSTALL_URL in capsys.readouterr().err


def test_a_repository_installed_on_a_moment_ago_is_found_on_a_second_look(
    cfg: Config, installed_a_moment_ago: SpyGitHub
) -> None:
    assert ask(cfg, installed_a_moment_ago, NOT_INSTALLED) == ANSWER


def test_another_accounts_repository_is_left_to_the_owners_own_login(
    cfg: Config, spy_github: SpyGitHub
) -> None:
    assert ask(cfg, spy_github, OTHER_ACCOUNT) == ""


def test_a_request_without_a_repository_gets_the_apps_token(
    cfg: Config, spy_github: SpyGitHub
) -> None:
    assert ask(cfg, spy_github, NO_PATH) == ANSWER


def test_other_hosts_are_left_to_the_next_helper(cfg: Config, spy_github: SpyGitHub) -> None:
    assert ask(cfg, spy_github, OTHER_HOST) == ""
    assert spy_github.minted == []


@pytest.mark.parametrize("action", ["store", "erase"])
def test_store_and_erase_do_nothing(cfg: Config, spy_github: SpyGitHub, action: str) -> None:
    assert ask(cfg, spy_github, HSP, action) == ""


def test_when_no_token_can_be_made_git_doesnt_fall_back_to_the_owners_login(
    cfg: Config, github_down: SpyGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    assert ask(cfg, github_down, HSP) == "quit=1\n"
    assert "network is unreachable" in capsys.readouterr().err
