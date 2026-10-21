"""The connections gauge follows the pool exactly (docs/0105)."""

from collections.abc import AsyncIterator

import pytest
from prometheus_client import REGISTRY
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from hsp import metrics
from tests.db.conftest import TEST_DB_URL


def in_use() -> float:
    return REGISTRY.get_sample_value("hsp_db_connections_in_use") or 0.0


@pytest.fixture
async def counted_engine() -> AsyncIterator[AsyncEngine]:
    assert TEST_DB_URL
    engine = create_async_engine(TEST_DB_URL)
    metrics.count_connections(engine)
    yield engine
    await engine.dispose()


async def test_a_connection_counts_while_it_is_out(counted_engine: AsyncEngine) -> None:
    before = in_use()
    async with counted_engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
        assert in_use() == before + 1
    assert in_use() == before
