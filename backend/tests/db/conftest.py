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

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

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
