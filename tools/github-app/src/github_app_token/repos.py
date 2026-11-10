"""Which GitHub repository a remote URL or a git credential request names."""

import re

_PATTERNS = (
    re.compile(r"^https://(?:[^@/]+@)?github\.com/(?P<owner>[^/]+)/(?P<name>[^/]+?)(?:\.git)?/?$"),
    re.compile(r"^(?:ssh://)?git@github\.com[:/](?P<owner>[^/]+)/(?P<name>[^/]+?)(?:\.git)?/?$"),
)


def from_url(url: str) -> tuple[str, str] | None:
    """`owner, name` for a github.com remote URL, or None for any other host."""
    for pattern in _PATTERNS:
        if match := pattern.match(url.strip()):
            return match["owner"], match["name"]
    return None


def from_path(path: str) -> tuple[str, str] | None:
    """`owner, name` from the `path` git sends a credential helper, like `owner/name.git`."""
    parts = path.strip("/").split("/")
    if len(parts) < 2 or not parts[0] or not parts[1]:
        return None
    return parts[0], parts[1].removesuffix(".git")
