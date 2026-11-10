"""The commands the user's Claude Code settings run (docs/0139, tools/github-app/README.md).

- `refresh`: the PreToolUse hook. Renews the token when it has under 10 minutes left.
- `session-start`: the SessionStart hook. Renews the token, and tells the session whether the App
  reaches the repository it starts in.
- `git-credential get`: git's credential helper. Hands git the App's token for the repositories
  the App is installed on.

On a machine or in a session without the settings, every command does nothing.
"""

import json
import subprocess
import sys
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import TextIO

from github_app_token import cache, config, github, repos

Now = Callable[[], datetime]


def _now() -> datetime:
    return datetime.now(UTC)


def refresh(cfg: config.Config, now: Now = _now, http: github.Http = github.send) -> int:
    try:
        cache.current(cfg, now(), http)
    except Exception as error:
        print(f"github-app-token: couldn't renew the App's token: {error}", file=sys.stderr)
        return 1
    return 0


def _origin(cwd: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(cwd), "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except OSError:
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def session_context(
    cfg: config.Config,
    origin: str | None,
    now: Now = _now,
    http: github.Http = github.send,
) -> str:
    """What the session should know about its GitHub identity in this repository."""
    try:
        state = cache.current(cfg, now(), http)
    except Exception as error:
        return (
            f"The GitHub App's token couldn't be made ({error}). git and gh will fail in this "
            "session. Tell the owner before any git or gh work (tools/github-app/README.md)."
        )
    identity = (
        f"This session pushes, opens PRs and comments on GitHub as {state.bot_login}, "
        "the owner's GitHub App (docs/0137)."
    )
    repo = repos.from_url(origin) if origin else None
    if repo is None:
        return identity
    owner, name = repo
    _, reach = cache.reach(cfg, state, owner, name, http)
    if reach is cache.Reach.INSTALLED:
        return identity
    if reach is cache.Reach.OWNERS_WITHOUT_APP:
        return (
            f"{identity} But the App isn't installed on {owner}/{name}, so git refuses to push or "
            "fetch here, and gh can only read what's public. Before any git or gh work, ask the "
            f"owner to install it on {owner}/{name}: {cfg.install_url} (Repository access). "
            "Don't work around it with the owner's own login."
        )
    return (
        f"{identity} {owner}/{name} belongs to another account, where the App can't be installed. "
        "Here git uses the owner's own login, and gh can only read what's public."
    )


def session_start(cfg: config.Config, stdin: TextIO, stdout: TextIO) -> int:
    try:
        cwd = Path(json.load(stdin).get("cwd") or ".")
    except ValueError:
        cwd = Path()
    context = session_context(cfg, _origin(cwd))
    output = {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": context}}
    stdout.write(json.dumps(output) + "\n")
    return 0


def _read_credential_request(stdin: TextIO) -> dict[str, str]:
    request: dict[str, str] = {}
    for line in stdin:
        line = line.rstrip("\r\n")
        if not line:
            break
        key, _, value = line.partition("=")
        request[key] = value
    return request


def git_credential(
    cfg: config.Config,
    action: str,
    stdin: TextIO,
    stdout: TextIO,
    now: Now = _now,
    http: github.Http = github.send,
) -> int:
    """git's credential protocol. Says nothing when git should ask its next helper."""
    if action != "get":
        return 0  # Nothing to store or erase: every token comes fresh from the App.
    request = _read_credential_request(stdin)
    if request.get("protocol") != "https" or request.get("host") != "github.com":
        return 0
    repo = repos.from_path(request.get("path", ""))

    def answer(token: str) -> int:
        stdout.write(f"username=x-access-token\npassword={token}\n")
        return 0

    def refuse(message: str) -> int:
        print(f"github-app-token: {message}", file=sys.stderr)
        stdout.write("quit=1\n")  # Don't let git fall back to the owner's own login
        return 0

    try:
        state = cache.current(cfg, now(), http)
        if repo is None:
            return answer(state.token)  # git didn't say which repository (no useHttpPath)
        owner, name = repo
        _, reach = cache.reach(cfg, state, owner, name, http)
    except Exception as error:
        return refuse(f"couldn't get the App's token: {error}")
    if reach is cache.Reach.INSTALLED:
        return answer(state.token)
    if reach is cache.Reach.OTHER_ACCOUNT:
        return 0  # Another account's repository: git uses the owner's own login (docs/0139)
    return refuse(
        f"the GitHub App isn't installed on {owner}/{name}. Install it at {cfg.install_url} "
        "(Repository access), then try again."
    )


def main(argv: Sequence[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    cfg = config.load()
    if cfg is None:
        return 0
    match args:
        case ["refresh"]:
            return refresh(cfg)
        case ["session-start"]:
            return session_start(cfg, sys.stdin, sys.stdout)
        case ["git-credential", action]:
            return git_credential(cfg, action, sys.stdin, sys.stdout)
        case _:
            print(__doc__, file=sys.stderr)
            return 2


if __name__ == "__main__":
    raise SystemExit(main())
