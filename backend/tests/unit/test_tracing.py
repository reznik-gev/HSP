"""OpenTelemetry tracing: off unless an OTLP endpoint is set; then each request is a span named
by its route, from hsp-api at this version, sampled at 10% unless OTEL_TRACES_SAMPLER says
otherwise (docs/0105)."""

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.sdk.trace.sampling import ALWAYS_ON, ParentBased, TraceIdRatioBased

from hsp import __version__
from hsp.main import create_app
from hsp.tracing import tracer_provider

ENDPOINT = "http://collector.test:4318"


@pytest.fixture
def no_otel(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "OTEL_EXPORTER_OTLP_ENDPOINT",
        "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
        "OTEL_TRACES_SAMPLER",
        "OTEL_TRACES_SAMPLER_ARG",
        "OTEL_SERVICE_NAME",
    ):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def spans() -> InMemorySpanExporter:
    return InMemorySpanExporter()


@pytest.fixture
def traced_api(
    no_otel: None, monkeypatch: pytest.MonkeyPatch, spans: InMemorySpanExporter
) -> Iterator[TestClient]:
    """The app with tracing on, every request sampled, spans kept in `spans`."""
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", ENDPOINT)
    monkeypatch.setenv("OTEL_TRACES_SAMPLER", "always_on")
    monkeypatch.setattr("hsp.tracing.span_processor", lambda: SimpleSpanProcessor(spans))
    app = create_app()

    @app.get("/_test/items/{item_id}")
    async def item(item_id: str) -> dict[str, str]:
        return {"id": item_id}

    with TestClient(app) as client:
        yield client


def provider_of(app: FastAPI) -> TracerProvider | None:
    provider: TracerProvider | None = app.state.tracer_provider
    return provider


def test_tracing_is_off_without_an_endpoint(no_otel: None) -> None:
    assert tracer_provider() is None
    assert provider_of(create_app()) is None


def test_a_request_is_a_span_named_by_its_route(
    traced_api: TestClient, spans: InMemorySpanExporter
) -> None:
    traced_api.get("/_test/items/42")

    [server] = [s for s in spans.get_finished_spans() if s.name == "GET /_test/items/{item_id}"]
    assert server.resource.attributes["service.name"] == "hsp-api"
    assert server.resource.attributes["service.version"] == __version__


def test_health_and_metrics_are_not_traced(
    traced_api: TestClient, spans: InMemorySpanExporter
) -> None:
    for path in ("/healthz", "/metrics"):
        traced_api.get(path)
    assert spans.get_finished_spans() == ()


def test_one_request_in_ten_is_sampled_by_default(
    no_otel: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", ENDPOINT)
    provider = tracer_provider()
    assert provider is not None
    expected = ParentBased(TraceIdRatioBased(0.1)).get_description()
    assert provider.sampler.get_description() == expected


def test_the_standard_sampler_setting_wins(no_otel: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", f"{ENDPOINT}/v1/traces")
    monkeypatch.setenv("OTEL_TRACES_SAMPLER", "always_on")
    provider = tracer_provider()
    assert provider is not None
    assert provider.sampler is ALWAYS_ON


def test_the_standard_service_name_wins(no_otel: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", ENDPOINT)
    monkeypatch.setenv("OTEL_SERVICE_NAME", "hsp-api-staging")
    provider = tracer_provider()
    assert provider is not None
    assert provider.resource.attributes["service.name"] == "hsp-api-staging"
