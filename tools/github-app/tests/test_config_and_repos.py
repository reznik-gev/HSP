import pytest

from github_app_token import config, repos

FULL_ENV = {
    "CLAUDE_GITHUB_APP_ID": "5699699",
    "CLAUDE_GITHUB_APP_INSTALLATION_ID": "180587576",
    "CLAUDE_GITHUB_APP_KEY_FILE": "/keys/app.pem",
    "GH_CONFIG_DIR": "/home/owner/.config/gh-reznik-gev-claude",
}
URLS = [
    ("https://github.com/reznik-gev/HSP.git", ("reznik-gev", "HSP")),
    ("https://github.com/reznik-gev/HSP", ("reznik-gev", "HSP")),
    ("https://token@github.com/reznik-gev/HSP.git", ("reznik-gev", "HSP")),
    ("git@github.com:reznik-gev/HSP.git", ("reznik-gev", "HSP")),
    ("ssh://git@github.com/reznik-gev/HSP.git", ("reznik-gev", "HSP")),
    ("https://gitlab.com/reznik-gev/HSP.git", None),
]


def test_a_machine_with_every_setting_is_set_up() -> None:
    loaded = config.load(FULL_ENV)

    assert loaded is not None
    assert loaded.install_url == "https://github.com/settings/installations/180587576"


@pytest.mark.parametrize("missing", list(FULL_ENV))
def test_a_machine_missing_any_setting_isnt_set_up(missing: str) -> None:
    assert config.load({k: v for k, v in FULL_ENV.items() if k != missing}) is None


@pytest.mark.parametrize(("url", "expected"), URLS)
def test_remote_urls_name_their_github_repository(
    url: str, expected: tuple[str, str] | None
) -> None:
    assert repos.from_url(url) == expected


def test_a_credential_path_names_its_repository() -> None:
    assert repos.from_path("reznik-gev/HSP.git") == ("reznik-gev", "HSP")
    assert repos.from_path("") is None
