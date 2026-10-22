"""Helpers for the session tests: a spy for token refreshes, and the type of `sign_in`."""

from collections.abc import Awaitable, Callable

from hsp.auth.sessions import Session, SessionTokens, with_tokens

#: The `sign_in` fixture: stores a session holding the tokens and sets its cookie on the client.
SignIn = Callable[[SessionTokens], Awaitable[None]]


class SpyRefresher:
    """Refreshes a session's tokens to `result` (or refuses, when None) and counts the calls."""

    def __init__(self) -> None:
        self.result: SessionTokens | None = None
        self.calls = 0

    async def refresh(self, session: Session) -> Session | None:
        self.calls += 1
        return with_tokens(session, self.result) if self.result else None
