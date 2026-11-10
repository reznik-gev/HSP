"""The settings, from the environment that the user's Claude Code settings set."""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    app_id: str
    installation_id: str
    key_file: Path
    # gh's config folder for Claude Code sessions only. The token and its state live here.
    gh_config_dir: Path

    @property
    def install_url(self) -> str:
        """Where the owner picks the repositories the App is installed on."""
        return f"https://github.com/settings/installations/{self.installation_id}"


def load(env: Mapping[str, str] = os.environ) -> Config | None:
    """The settings, or None on a machine (or in a session) not set up for the App."""
    names = (
        "CLAUDE_GITHUB_APP_ID",
        "CLAUDE_GITHUB_APP_INSTALLATION_ID",
        "CLAUDE_GITHUB_APP_KEY_FILE",
        "GH_CONFIG_DIR",
    )
    values = [env.get(name, "").strip() for name in names]
    if not all(values):
        return None
    app_id, installation_id, key_file, gh_config_dir = values
    return Config(app_id, installation_id, Path(key_file), Path(gh_config_dir))
