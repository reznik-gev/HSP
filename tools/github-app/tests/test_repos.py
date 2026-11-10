import pytest

from github_app_token import repos

URLS = [
    ("https://github.com/reznik-gev/HSP.git", ("reznik-gev", "HSP")),
    ("https://github.com/reznik-gev/HSP", ("reznik-gev", "HSP")),
    ("https://token@github.com/reznik-gev/HSP.git", ("reznik-gev", "HSP")),
    ("git@github.com:reznik-gev/HSP.git", ("reznik-gev", "HSP")),
    ("ssh://git@github.com/reznik-gev/HSP.git", ("reznik-gev", "HSP")),
    ("https://gitlab.com/reznik-gev/HSP.git", None),
]
PATHS = [
    ("reznik-gev/HSP.git", ("reznik-gev", "HSP")),
    ("", None),
]


@pytest.mark.parametrize(("url", "expected"), URLS)
def test_remote_urls_name_their_github_repository(
    url: str, expected: tuple[str, str] | None
) -> None:
    assert repos.from_url(url) == expected


@pytest.mark.parametrize(("path", "expected"), PATHS)
def test_a_credential_path_names_its_repository(
    path: str, expected: tuple[str, str] | None
) -> None:
    assert repos.from_path(path) == expected
