"""OpenTelemetry tracing: off unless an OTLP endpoint is set; then each request is a span named
by its route, from hsp-api at this version, sampled at 10% unless OTEL_TRACES_SAMPLER says
otherwise (docs/0105)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.sdk.trace.sampling import ALWAYS_ON, ParentBased, TraceIdRatioBased

from hsp import __version__
from hsp.main import create_app
from hsp.tracing import tracer_provider

ENDPOINT = "http://collector.test:4318"
TRACES_ENDPOINT = f"{ENDPOINT}/v1/traces"
STAGING_SERVICE_NAME = "hsp-api-staging"


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
def otlp_endpoint_set(no_otel: None, monkeypatch: pytest.MonkeyPatch) -> None:
    """Tracing on, with the standard endpoint and nothing else set."""
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", ENDPOINT)


@pytest.fixture
def traces_endpoint_sampling_all(no_otel: None, monkeypatch: pytest.MonkeyPatch) -> None:
    """Tracing on through the traces-only endpoint, with the standard sampler set to always_on."""
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", TRACES_ENDPOINT)
    monkeypatch.setenv("OTEL_TRACES_SAMPLER", "always_on")


@pytest.fixture
def staging_service_name(otlp_endpoint_set: None, monkeypatch: pytest.MonkeyPatch) -> None:
    """Tracing on, under the standard service name setting."""
    monkeypatch.setenv("OTEL_SERVICE_NAME", STAGING_SERVICE_NAME)


@pytest.fixture
def spans(monkeypatch: pytest.MonkeyPatch) -> InMemorySpanExporter:
    """Where spans go, instead of an OTLP endpoint."""
    exporter = InMemorySpanExporter()
    monkeypatch.setattr("hsp.tracing.span_processor", lambda: SimpleSpanProcessor(exporter))
    return exporter


def probe_client() -> Iterator[TestClient]:
    app = create_app()

    @app.get("/_test/items/{item_id}")
    async def item(item_id: str) -> dict[str, str]:
        return {"id": item_id}

    with TestClient(app) as client:
        yield client


@pytest.fixture
def traced_api(
    otlp_endpoint_set: None, monkeypatch: pytest.MonkeyPatch, spans: InMemorySpanExporter
) -> Iterator[TestClient]:
    """The app with tracing on and every request sampled; spans go to `spans`."""
    monkeypatch.setenv("OTEL_TRACES_SAMPLER", "always_on")
    yield from probe_client()


@pytest.fixture
def untraced_api(no_otel: None, spans: InMemorySpanExporter) -> Iterator[TestClient]:
    """The app with no tracing endpoint set; any span would still go to `spans`."""
    yield from probe_client()


def test_tracing_is_off_without_an_endpoint(
    untraced_api: TestClient, spans: InMemorySpanExporter
) -> None:
    untraced_api.get("/_test/items/42")
    assert spans.get_finished_spans() == ()


def test_a_request_is_a_span_named_by_its_route(
    traced_api: TestClient, spans: InMemorySpanExporter
) -> None:
    traced_api.get("/_test/items/42")

    [server] = [s for s in spans.get_finished_spans() if s.name == "GET /_test/items/{item_id}"]
    assert server.resource.attributes["service.name"] == "hsp-api"
    assert server.resource.attributes["service.version"] == __version__


@pytest.mark.parametrize("path", ["/healthz", "/readyz", "/metrics"])
def test_probes_are_not_traced(
    traced_api: TestClient, spans: InMemorySpanExporter, path: str
) -> None:
    traced_api.get(path)
    assert spans.get_finished_spans() == ()


@pytest.mark.usefixtures("otlp_endpoint_set")
def test_one_request_in_ten_is_sampled_by_default() -> None:
    provider = tracer_provider()
    assert provider is not None
    expected = ParentBased(TraceIdRatioBased(0.1)).get_description()
    assert provider.sampler.get_description() == expected


@pytest.mark.usefixtures("traces_endpoint_sampling_all")
def test_the_standard_sampler_setting_wins() -> None:
    provider = tracer_provider()
    assert provider is not None
    assert provider.sampler is ALWAYS_ON


@pytest.mark.usefixtures("staging_service_name")
def test_the_standard_service_name_wins() -> None:
    provider = tracer_provider()
    assert provider is not None
    assert provider.resource.attributes["service.name"] == STAGING_SERVICE_NAME
