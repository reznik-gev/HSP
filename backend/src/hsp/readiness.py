"""Is the API ready for traffic? The checks behind /readyz and the schema check at startup
(docs/0056, docs/0057, docs/0105)."""

import time
from collections.abc import Awaitable, Callable, Mapping
from pathlib import Path

import httpx2
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncConnection

from hsp.auth.oidc import discovery_url
from hsp.db import get_engine

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"

#: A check answers None when all is well, or what's wrong.
Check = Callable[[], Awaitable[str | None]]


class SchemaMismatchError(RuntimeError):
    """The database's schema isn't the one this version of HSP was built for."""


def code_head() -> str:
    """The Alembic revision this code expects the database to be at."""
    head = ScriptDirectory(str(MIGRATIONS_DIR)).get_current_head()
    if head is None:
        raise RuntimeError(f"no migrations found in {MIGRATIONS_DIR}")
    return head


async def database_revision(conn: AsyncConnection) -> str | None:
    """The revision the database was migrated to, or None if it was never migrated."""
    try:
        async with conn.begin_nested():
            row = (await conn.execute(text("SELECT version_num FROM alembic_version"))).first()
    except ProgrammingError:  # no alembic_version table
        return None
    return row[0] if row else None


async def schema_problem(conn: AsyncConnection) -> str | None:
    """None if the database is at `code_head()`; otherwise what to do about it."""
    expected, actual = code_head(), await database_revision(conn)
    if actual == expected:
        return None
    return (
        f"the database schema is at {actual or 'no revision'}, but this version of HSP needs "
        f"{expected}: run the migrate job (docker compose run --rm migrate)"
    )


async def check_schema_at_startup() -> None:
    """Refuse to start on a schema the code wasn't written for (docs/0056)."""
    async with get_engine().connect() as conn:
        problem = await schema_problem(conn)
    if problem:
        raise SchemaMismatchError(problem)


async def database_and_schema() -> str | None:
    """The `database` check: None when the database answers at the schema this code needs,
    otherwise what's wrong. Only failing to reach it counts as "unreachable"; anything else,
    like missing migrations, is a bug and is raised."""
    try:
        async with get_engine().connect() as conn:
            return await schema_problem(conn)
    except (OSError, DBAPIError) as exc:
        return f"database unreachable ({type(exc).__name__})"


class KeycloakProbe:
    """Asks Keycloak for its OIDC discovery document, and remembers the answer for `ttl_s`, so
    frequent health checks don't load it (docs/0105)."""

    def __init__(
        self,
        issuer_url: str,
        *,
        transport: httpx2.AsyncBaseTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
        timeout_s: float = 2,
        ttl_s: float = 10,
    ) -> None:
        self._url = discovery_url(issuer_url)
        self._transport = transport
        self._clock = clock
        self._timeout_s = timeout_s
        self._ttl_s = ttl_s
        self._last: tuple[float, str | None] | None = None

    async def __call__(self) -> str | None:
        now = self._clock()
        if self._last is not None and now - self._last[0] < self._ttl_s:
            return self._last[1]
        result = await self._ask()
        self._last = (now, result)
        return result

    async def _ask(self) -> str | None:
        try:
            async with httpx2.AsyncClient(transport=self._transport) as http:
                r = await http.get(self._url, timeout=self._timeout_s)
        except httpx2.HTTPError as exc:
            return f"Keycloak unreachable ({type(exc).__name__})"
        if r.status_code != 200:
            return f"Keycloak answered {r.status_code}"
        return None


class Readiness:
    """Named checks; ready when every one passes."""

    def __init__(self, checks: Mapping[str, Check]) -> None:
        self._checks = dict(checks)

    async def problems(self) -> dict[str, str]:
        found = {}
        for name, check in self._checks.items():
            problem = await check()
            if problem is not None:
                found[name] = problem
        return found


def default_readiness(oidc_issuer_url: str) -> Readiness:
    return Readiness({"database": database_and_schema, "keycloak": KeycloakProbe(oidc_issuer_url)})
