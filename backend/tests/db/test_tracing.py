"""With tracing on, the engine's queries are spans (docs/0105)."""

from collections.abc import AsyncIterator

import pytest
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from hsp import tracing
from tests.db.conftest import TEST_DB_URL


@pytest.fixture
def spans(monkeypatch: pytest.MonkeyPatch) -> InMemorySpanExporter:
    """Tracing on, every span kept here."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(tracing, "_provider", provider)
    return exporter


@pytest.fixture
async def traced_engine(spans: InMemorySpanExporter) -> AsyncIterator[AsyncEngine]:
    assert TEST_DB_URL
    engine = create_async_engine(TEST_DB_URL)
    tracing.instrument_engine(engine)
    yield engine
    await engine.dispose()
    # The instrumentor is one shared object that patches SQLAlchemy: leave nothing behind.
    SQLAlchemyInstrumentor().uninstrument()


async def test_queries_are_spans(traced_engine: AsyncEngine, spans: InMemorySpanExporter) -> None:
    async with traced_engine.connect() as conn:
        await conn.execute(text("SELECT 1"))

    assert any(s.name.startswith("SELECT") for s in spans.get_finished_spans())
