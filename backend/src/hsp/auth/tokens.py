"""Session tokens, CSRF tokens and at-rest encryption of OIDC tokens (docs/0077)."""

import hashlib
import hmac
import secrets

from cryptography.fernet import Fernet, InvalidToken


def new_session_token() -> str:
    """Opaque value for the session cookie. Only its hash is stored."""
    return secrets.token_urlsafe(32)


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


class TokenDecryptError(Exception):
    """Stored token can't be decrypted (e.g. the encryption key was rotated)."""


class TokenCipher:
    """Symmetric encryption for tokens stored in the database (Fernet: AES-128-CBC + HMAC)."""

    def __init__(self, key: bytes) -> None:
        self._fernet = Fernet(key)

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as exc:
            raise TokenDecryptError from exc
