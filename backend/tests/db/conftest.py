"""Fixtures for DB integration tests (docs/0061).

Requires HSP_TEST_DATABASE_URL, e.g.
    postgresql+asyncpg://hsp:hsp@localhost:5432/hsp_test
The schema is dropped and rebuilt with Alembic once per session, so every run also tests that the
migrations apply to an empty database. Each test runs inside a transaction that is rolled back.
"""

import asyncio
import os
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession, create_async_engine

from tests.db.plan_helpers import context
from tests.db.seat_helpers import published_seats

BACKEND_DIR = Path(__file__).resolve().parents[2]
TEST_DB_URL = os.environ.get("HSP_TEST_DATABASE_URL")


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        if "tests/db/" in item.nodeid.replace("\\", "/"):
            item.add_marker(pytest.mark.db)
            if not TEST_DB_URL:
                item.add_marker(pytest.mark.skip(reason="HSP_TEST_DATABASE_URL not set"))


@pytest.fixture(scope="session")
async def engine() -> AsyncIterator[AsyncEngine]:
    assert TEST_DB_URL
    eng = create_async_engine(TEST_DB_URL)
    async with eng.begin() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    # Alembic's env.py runs its own event loop, so run it in a subprocess (off the event loop).
    await asyncio.to_thread(
        subprocess.run,
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env={**os.environ, "HSP_DATABASE_URL": TEST_DB_URL},
        check=True,
    )
    yield eng
    await eng.dispose()


@pytest.fixture
async def conn(engine: AsyncEngine) -> AsyncIterator[AsyncConnection]:
    async with engine.connect() as connection:
        trans = await connection.begin()
        try:
            yield connection
        finally:
            await trans.rollback()


@pytest.fixture
def rolled_back_db_session(conn: AsyncConnection) -> AsyncSession:
    """A session inside the test's transaction; its commits are savepoints, rolled back after."""
    return AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)


@pytest.fixture
async def admin_editing_new_floor(rolled_back_db_session: AsyncSession) -> dict[str, Any]:
    """A new floor in the default tenant whose edit lock the admin "alice" holds, with the stock
    desk and a zone type to place (tests/db/plan_helpers.py)."""
    return await context(rolled_back_db_session)


@pytest.fixture
async def published_floor_with_seats(rolled_back_db_session: AsyncSession) -> dict[str, Any]:
    """A floor whose published plan has two assigned seats (a, b), a bookable one, and a seat
    only in the draft (draft_only) (tests/db/seat_helpers.py)."""
    return await published_seats(rolled_back_db_session)
