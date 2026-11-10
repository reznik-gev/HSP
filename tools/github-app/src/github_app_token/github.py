"""The few GitHub API calls the helper makes."""

import json
import time
from collections.abc import Callable
from datetime import datetime
from typing import Any

from github_app_token.config import Config

API = "https://api.github.com"

# Sends one request: (method, url, headers) -> the parsed JSON body. Tests pass their own.
Http = Callable[[str, str, dict[str, str]], Any]


def send(method: str, url: str, headers: dict[str, str]) -> Any:
    import urllib.request  # Loaded only when a token is renewed: see app_jwt

    request = urllib.request.Request(url, method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def _headers(authorization: str) -> dict[str, str]:
    return {
        "Authorization": authorization,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "github-app-token",
    }


def app_jwt(config: Config, now: float | None = None) -> str:
    """A JSON web token signed with the App's private key, valid for 9 minutes."""
    # Imported here, not at the top: the hook runs before every shell command, and loading the
    # crypto libraries takes most of a second. A token with time left needs none of it.
    import jwt

    issued = int(now if now is not None else time.time()) - 60  # GitHub allows for clock drift
    claims = {"iat": issued, "exp": issued + 600, "iss": config.app_id}
    return jwt.encode(claims, config.key_file.read_bytes(), algorithm="RS256")


def bot_login(config: Config, http: Http = send) -> str:
    """The App's bot account, for example `reznik-gev-claude[bot]`."""
    app = http("GET", f"{API}/app", _headers(f"Bearer {app_jwt(config)}"))
    return f"{app['slug']}[bot]"


def installation_account(config: Config, http: Http = send) -> str:
    """The account the App is installed on, which owns the repositories it can reach."""
    url = f"{API}/app/installations/{config.installation_id}"
    installation = http("GET", url, _headers(f"Bearer {app_jwt(config)}"))
    return str(installation["account"]["login"])


def mint(config: Config, http: Http = send) -> tuple[str, datetime]:
    """A new installation token, and when it expires."""
    url = f"{API}/app/installations/{config.installation_id}/access_tokens"
    body = http("POST", url, _headers(f"Bearer {app_jwt(config)}"))
    expires_at = datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00"))
    return str(body["token"]), expires_at


def repositories(token: str, http: Http = send) -> list[str]:
    """The repositories the App is installed on, as lower-case `owner/name`."""
    names: list[str] = []
    page = 1
    while True:
        url = f"{API}/installation/repositories?per_page=100&page={page}"
        body = http("GET", url, _headers(f"token {token}"))
        names += [str(repo["full_name"]).lower() for repo in body["repositories"]]
        if len(names) >= body["total_count"] or not body["repositories"]:
            return names
        page += 1
