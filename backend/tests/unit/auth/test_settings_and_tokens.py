"""Auth settings and secrets: the production guard, token encryption and reading JWT claims
(docs/0077)."""

import base64

import pytest
from pydantic import ValidationError

from hsp.auth.principal import jwt_claims, realm_roles
from hsp.auth.tokens import TokenCipher, TokenDecryptError
from hsp.config import DEV_SESSION_ENCRYPTION_KEY, Settings
from tests.unit.auth.stubs import stub_jwt

OTHER_KEY = base64.urlsafe_b64encode(b"x" * 32)


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
