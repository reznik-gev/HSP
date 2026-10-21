"""OpenTelemetry tracing (docs/0057, docs/0105). Off unless OTEL_EXPORTER_OTLP_ENDPOINT (or
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) is set; everything else is the standard OTEL_* settings.

Spans are exported over OTLP/HTTP. Requests (FastAPI) and database queries (SQLAlchemy) are
traced. Calls to Keycloak aren't: OpenTelemetry's httpx instrumentation doesn't cover httpx2
(docs/0077), a known gap.
"""

import os
import re
from collections.abc import Iterable

from fastapi import FastAPI
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased
from sqlalchemy.ext.asyncio import AsyncEngine

from hsp import __version__

#: Requests sampled when OTEL_TRACES_SAMPLER isn't set; a caller's sampling decision wins.
DEFAULT_SAMPLE_RATIO = 0.1

_provider: TracerProvider | None = None


def span_processor() -> SpanProcessor:
    """Batches spans to the OTLP/HTTP endpoint from the standard settings."""
    return BatchSpanProcessor(OTLPSpanExporter())


def tracer_provider() -> TracerProvider | None:
    """A provider for this process's spans, or None when tracing is off."""
    if not (
        os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
        or os.environ.get("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
    ):
        return None
    attributes = {"service.version": __version__}
    if not os.environ.get("OTEL_SERVICE_NAME"):
        attributes["service.name"] = "hsp-api"
    sampler = None  # from OTEL_TRACES_SAMPLER
    if not os.environ.get("OTEL_TRACES_SAMPLER"):
        sampler = ParentBased(TraceIdRatioBased(DEFAULT_SAMPLE_RATIO))
    provider = TracerProvider(resource=Resource.create(attributes), sampler=sampler)
    provider.add_span_processor(span_processor())
    return provider


def configure_tracing(app: FastAPI, untraced_paths: Iterable[str]) -> None:
    """Trace the app's requests, if tracing is on, except `untraced_paths` (the probes, which
    would drown the traces that matter); `instrument_engine` adds the queries."""
    global _provider
    _provider = tracer_provider()
    if _provider is not None:
        # Patterns searched in the whole URL: anchored, so they match only these paths.
        excluded = ",".join(f"{re.escape(p)}$" for p in sorted(untraced_paths))
        FastAPIInstrumentor.instrument_app(app, tracer_provider=_provider, excluded_urls=excluded)


def instrument_engine(engine: AsyncEngine) -> None:
    """Trace the engine's queries, if tracing is on (hsp/db.py calls it when it creates one)."""
    if _provider is not None:
        # The instrumentation declares support only below SQLAlchemy 2.1, and would silently do
        # nothing on ours; it works on 2.1, which tests/db/test_tracing.py checks.
        SQLAlchemyInstrumentor().instrument(
            engine=engine.sync_engine, tracer_provider=_provider, skip_dep_check=True
        )
