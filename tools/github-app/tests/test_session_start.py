from github_app_token import cli
from github_app_token.config import Config

from .conftest import INSTALL_URL, NOW, SpyGitHub

HSP = "https://github.com/reznik-gev/HSP.git"
NOT_INSTALLED = "git@github.com:reznik-gev/other.git"
OTHER_ACCOUNT = "https://github.com/someone-else/tool"
NOT_GITHUB = "https://gitlab.com/reznik-gev/HSP.git"
IDENTITY = "as reznik-gev-claude[bot]"


def context(cfg: Config, spy_github: SpyGitHub, origin: str | None) -> str:
    return cli.session_context(cfg, origin, lambda: NOW, spy_github)


def test_in_a_repository_the_app_reaches_the_session_hears_only_its_identity(
    cfg: Config, spy_github: SpyGitHub
) -> None:
    text = context(cfg, spy_github, HSP)

    assert IDENTITY in text
    assert "isn't installed" not in text


def test_in_the_owners_repository_without_the_app_the_session_asks_the_owner_to_install_it(
    cfg: Config, spy_github: SpyGitHub
) -> None:
    text = context(cfg, spy_github, NOT_INSTALLED)

    assert "isn't installed on reznik-gev/other" in text
    assert INSTALL_URL in text


def test_in_another_accounts_repository_the_session_hears_git_uses_the_owners_login(
    cfg: Config, spy_github: SpyGitHub
) -> None:
    assert "git uses the owner's own login" in context(cfg, spy_github, OTHER_ACCOUNT)


def test_outside_github_the_session_hears_only_its_identity(
    cfg: Config, spy_github: SpyGitHub
) -> None:
    assert context(cfg, spy_github, NOT_GITHUB).endswith("(docs/0137).")


def test_when_no_token_can_be_made_the_session_is_told_to_tell_the_owner(
    cfg: Config, github_down: SpyGitHub
) -> None:
    assert "Tell the owner" in context(cfg, github_down, HSP)
