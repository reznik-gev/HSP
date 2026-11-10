import pytest

from github_app_token import config

from .conftest import APP_ID, INSTALL_URL, INSTALLATION_ID

FULL_ENV = {
    "CLAUDE_GITHUB_APP_ID": APP_ID,
    "CLAUDE_GITHUB_APP_INSTALLATION_ID": INSTALLATION_ID,
    "CLAUDE_GITHUB_APP_KEY_FILE": "/keys/app.pem",
    "GH_CONFIG_DIR": "/home/owner/.config/gh-reznik-gev-claude",
}


def test_a_machine_with_every_setting_is_set_up() -> None:
    loaded = config.load(FULL_ENV)

    assert loaded is not None
    assert loaded.install_url == INSTALL_URL


@pytest.mark.parametrize("missing", list(FULL_ENV))
def test_a_machine_missing_any_setting_isnt_set_up(missing: str) -> None:
    assert config.load({k: v for k, v in FULL_ENV.items() if k != missing}) is None
