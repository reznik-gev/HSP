"""Settings and secrets: the production guard, the database password, token encryption and
reading JWT claims (docs/0077, docs/0099)."""

import base64

import pytest
from pydantic import ValidationError
from sqlalchemy import make_url

from hsp.auth.principal import jwt_claims, realm_roles
from hsp.auth.tokens import TokenCipher, TokenDecryptError
from hsp.config import DEV_SESSION_ENCRYPTION_KEY, Settings
from tests.unit.auth.stubs import stub_jwt

OTHER_KEY = base64.urlsafe_b64encode(b"x" * 32)
#: Characters a URL would need escaped.
DATABASE_PASSWORD = "p@ss:w/rd"


@pytest.fixture
def settings_with_separate_database_password() -> Settings:
    return Settings(
        database_url="postgresql+asyncpg://hsp@db:5432/hsp",  # type: ignore[arg-type]
        database_password=DATABASE_PASSWORD,  # type: ignore[arg-type]
    )


@pytest.fixture
def settings_with_database_password_in_url() -> Settings:
    return Settings(database_url="postgresql+asyncpg://hsp:pw@db:5432/hsp")  # type: ignore[arg-type]


def test_production_requires_real_secrets() -> None:
    with pytest.raises(ValidationError, match="HSP_SESSION_ENCRYPTION_KEY"):
        Settings(environment="production")


def test_development_uses_dev_key_and_insecure_cookie_on_http() -> None:
    s = Settings(environment="development", public_url="http://localhost:5173")
    assert s.session_key() == DEV_SESSION_ENCRYPTION_KEY
    assert s.session_cookie_secure is False
    assert Settings(environment="test").session_cookie_secure is True


def test_cipher_round_trip_and_key_rotation() -> None:
    cipher = TokenCipher(DEV_SESSION_ENCRYPTION_KEY)
    secret = cipher.encrypt("refresh-token")
    assert "refresh-token" not in secret
    assert cipher.decrypt(secret) == "refresh-token"
    with pytest.raises(TokenDecryptError):
        TokenCipher(OTHER_KEY).decrypt(secret)


def test_jwt_claims_and_roles() -> None:
    claims = jwt_claims(stub_jwt({"realm_access": {"roles": ["hsp-admin", 3]}}))
    assert realm_roles(claims) == {"hsp-admin"}
    assert realm_roles({}) == frozenset()
    with pytest.raises(ValueError):
        jwt_claims("not-a-jwt")


def test_database_password_can_come_separately_from_the_url(
    settings_with_separate_database_password: Settings,
) -> None:
    url = make_url(settings_with_separate_database_password.database_dsn)
    assert (url.username, url.password, url.host, url.database) == (
        "hsp",
        DATABASE_PASSWORD,
        "db",
        "hsp",
    )


def test_database_url_keeps_its_own_password_when_none_is_given(
    settings_with_database_password_in_url: Settings,
) -> None:
    assert (
        settings_with_database_password_in_url.database_dsn
        == "postgresql+asyncpg://hsp:pw@db:5432/hsp"
    )
