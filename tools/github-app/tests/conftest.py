from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from github_app_token.config import Config

APP_ID = "5699699"
INSTALLATION_ID = "180587576"
APP_SLUG = "reznik-gev-claude"
ACCOUNT = "reznik-gev"
INSTALLED = ["reznik-gev/HSP"]
NOW = datetime(2026, 11, 10, 12, 0, tzinfo=UTC)
TOKEN_LIFETIME = timedelta(hours=1)


class FakeGitHub:
    """GitHub's App endpoints, enough for the helper. Checks the App's JWT like GitHub does."""

    def __init__(self, public_key: rsa.RSAPublicKey) -> None:
        self.public_key = public_key
        self.installed = list(INSTALLED)
        self.minted: list[str] = []
        self.failing = False

    def _check_jwt(self, headers: dict[str, str]) -> None:
        claims = jwt.decode(
            headers["Authorization"].removeprefix("Bearer "),
            self.public_key,
            algorithms=["RS256"],
            options={"verify_exp": False, "verify_iat": False},
        )
        assert claims["iss"] == APP_ID

    def __call__(self, method: str, url: str, headers: dict[str, str]) -> Any:
        if self.failing:
            raise OSError("network is unreachable")
        path = url.removeprefix("https://api.github.com")
        if method == "GET" and path == "/app":
            self._check_jwt(headers)
            return {"slug": APP_SLUG}
        if method == "GET" and path == f"/app/installations/{INSTALLATION_ID}":
            self._check_jwt(headers)
            return {"account": {"login": ACCOUNT}}
        if method == "POST" and path == f"/app/installations/{INSTALLATION_ID}/access_tokens":
            self._check_jwt(headers)
            token = f"ghs_token{len(self.minted) + 1}"
            self.minted.append(token)
            expires = (NOW + TOKEN_LIFETIME).isoformat().replace("+00:00", "Z")
            return {"token": token, "expires_at": expires}
        if method == "GET" and path.startswith("/installation/repositories"):
            assert headers["Authorization"] == f"token {self.minted[-1]}"
            repositories = [{"full_name": name} for name in self.installed]
            return {"total_count": len(repositories), "repositories": repositories}
        raise AssertionError(f"unexpected request: {method} {url}")


@pytest.fixture
def app_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def cfg(tmp_path: Path, app_key: rsa.RSAPrivateKey) -> Config:
    key_file = tmp_path / "app.private-key.pem"
    key_file.write_bytes(
        app_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return Config(APP_ID, INSTALLATION_ID, key_file, tmp_path / "gh-claude")


@pytest.fixture
def fake_github(app_key: rsa.RSAPrivateKey) -> FakeGitHub:
    return FakeGitHub(app_key.public_key())
