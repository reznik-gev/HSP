"""The token Claude Code sessions share, kept in their own gh config folder (docs/0139).

The token is on disk for at most an hour: gh reads it from `hosts.yml`, and the helper keeps it,
with when it expires and which repositories it reaches, in `github-app-token.json`.
"""

import json
import os
import tempfile
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timedelta
from enum import Enum, auto
from pathlib import Path

from github_app_token import github
from github_app_token.config import Config

# The hook renews the token when it has less than this left (docs/0139).
RENEW_BEFORE = timedelta(minutes=10)
STATE_FILE = "github-app-token.json"


@dataclass(frozen=True)
class State:
    token: str
    expires_at: datetime
    bot_login: str
    account: str
    repositories: tuple[str, ...]

    def reaches(self, owner: str, name: str) -> bool:
        return f"{owner}/{name}".lower() in self.repositories


def _write_private(path: Path, text: str) -> None:
    """Writes a file only this user can read, replacing any old one in a single step."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as file:
            file.write(text)
        os.chmod(temp, 0o600)  # Windows keeps only the user-profile folder's own access rules
        os.replace(temp, path)
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise


def load(config: Config) -> State | None:
    try:
        raw = json.loads((config.gh_config_dir / STATE_FILE).read_text(encoding="utf-8"))
        return State(
            token=raw["token"],
            expires_at=datetime.fromisoformat(raw["expires_at"]),
            bot_login=raw["bot_login"],
            account=raw["account"],
            repositories=tuple(raw["repositories"]),
        )
    except OSError, ValueError, KeyError, TypeError:
        return None


def save(config: Config, state: State) -> None:
    raw = asdict(state) | {
        "expires_at": state.expires_at.isoformat(),
        "repositories": list(state.repositories),
    }
    _write_private(config.gh_config_dir / STATE_FILE, json.dumps(raw, indent=2) + "\n")
    # The same layout `gh auth login` writes. gh reads the token from here, as the App's bot.
    hosts = (
        "github.com:\n"
        f"    oauth_token: {state.token}\n"
        f"    user: {state.bot_login}\n"
        "    git_protocol: https\n"
    )
    _write_private(config.gh_config_dir / "hosts.yml", hosts)


def current(config: Config, now: datetime, http: github.Http = github.send) -> State:
    """The saved token if it has more than RENEW_BEFORE left; otherwise a new one, saved."""
    state = load(config)
    if state is not None and state.expires_at - now > RENEW_BEFORE:
        return state
    token, expires_at = github.mint(config, http)
    state = State(
        token=token,
        expires_at=expires_at,
        bot_login=state.bot_login if state else github.bot_login(config, http),
        account=state.account if state else github.installation_account(config, http),
        repositories=tuple(github.repositories(token, http)),
    )
    save(config, state)
    return state


def recheck_repositories(config: Config, state: State, http: github.Http = github.send) -> State:
    """Reads the App's repositories again, in case the owner just installed it on one more."""
    state = replace(state, repositories=tuple(github.repositories(state.token, http)))
    save(config, state)
    return state


class Reach(Enum):
    """Whether the App reaches a repository, and if not, why (docs/0139 points 4 and 5)."""

    INSTALLED = auto()
    OWNERS_WITHOUT_APP = auto()
    OTHER_ACCOUNT = auto()


def reach(
    config: Config, state: State, owner: str, name: str, http: github.Http = github.send
) -> Reach:
    """Whether the App reaches owner/name. For the owner's repositories it looks again first,
    in case the owner just installed the App there."""
    if state.reaches(owner, name):
        return Reach.INSTALLED
    if owner.lower() != state.account.lower():
        return Reach.OTHER_ACCOUNT
    state = recheck_repositories(config, state, http)
    return Reach.INSTALLED if state.reaches(owner, name) else Reach.OWNERS_WITHOUT_APP
