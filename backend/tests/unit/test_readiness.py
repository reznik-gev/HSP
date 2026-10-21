"""/readyz names what isn't ready; Keycloak is asked at most every 10 s; in production the API
refuses to start on the wrong schema (docs/0056, docs/0105)."""

from collections.abc import Iterator

import httpx2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import hsp.main
from hsp.config import get_settings
from hsp.main import create_app
from hsp.problems import PROBLEM_JSON
from hsp.readiness import KeycloakProbe, Readiness, SchemaMismatchError

ISSUER = "http://keycloak.test/auth/realms/hsp"
DISCOVERY = f"{ISSUER}/.well-known/openid-configuration"


async def passes() -> str | None:
    return None


async def database_down() -> str | None:
    return "database unreachable (OSError)"


async def keycloak_down() -> str | None:
    return "Keycloak answered 503"


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class SpyKeycloak:
    """A Keycloak that answers `status` (or fails to connect, when None) and counts the calls."""

    def __init__(self) -> None:
        self.status: int | None = 200
        self.urls: list[str] = []
        self.timeouts: list[object] = []

    def transport(self) -> httpx2.MockTransport:
        def handle(request: httpx2.Request) -> httpx2.Response:
            self.urls.append(str(request.url))
            self.timeouts.append(request.extensions.get("timeout"))
            if self.status is None:
                raise httpx2.ConnectError("refused", request=request)
            return httpx2.Response(self.status, json={"issuer": ISSUER})

        return httpx2.MockTransport(handle)


@pytest.fixture
def every_check_passes(app: FastAPI) -> None:
    """The app's /readyz checks all pass."""
    app.state.readiness = Readiness({"database": passes, "keycloak": passes})


@pytest.fixture
def database_and_keycloak_down(app: FastAPI) -> None:
    """The app's /readyz finds neither the database nor Keycloak."""
    app.state.readiness = Readiness({"database": database_down, "keycloak": keycloak_down})


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def keycloak() -> SpyKeycloak:
    return SpyKeycloak()


@pytest.fixture
def probe(keycloak: SpyKeycloak, clock: FakeClock) -> KeycloakProbe:
    return KeycloakProbe(ISSUER, transport=keycloak.transport(), clock=clock)


# --- /readyz --------------------------------------------------------------------------------


@pytest.mark.usefixtures("every_check_passes")
def test_ready_when_every_check_passes(api: TestClient) -> None:
    r = api.get("/readyz")
    assert r.status_code == 200
    assert r.json()["status"] == "ready"


@pytest.mark.usefixtures("database_and_keycloak_down")
def test_not_ready_names_each_failed_check(api: TestClient) -> None:
    r = api.get("/readyz")
    assert r.status_code == 503
    assert r.headers["content-type"] == PROBLEM_JSON
    body = r.json()
    assert body["type"].endswith("/not-ready")
    assert body["detail"] == (
        "database: database unreachable (OSError); keycloak: Keycloak answered 503"
    )


# --- asking Keycloak ------------------------------------------------------------------------


async def test_keycloak_is_asked_for_its_discovery_document(
    probe: KeycloakProbe, keycloak: SpyKeycloak
) -> None:
    assert await probe() is None
    assert keycloak.urls == [DISCOVERY]
    assert keycloak.timeouts == [{"connect": 2, "read": 2, "write": 2, "pool": 2}]


async def test_keycloak_answering_an_error_is_not_ready(
    probe: KeycloakProbe, keycloak: SpyKeycloak
) -> None:
    keycloak.status = 503
    assert await probe() == "Keycloak answered 503"


async def test_keycloak_unreachable_is_not_ready(
    probe: KeycloakProbe, keycloak: SpyKeycloak
) -> None:
    keycloak.status = None
    assert await probe() == "Keycloak unreachable (ConnectError)"


async def test_keycloak_is_asked_at_most_every_10_s(
    probe: KeycloakProbe, keycloak: SpyKeycloak, clock: FakeClock
) -> None:
    await probe()
    keycloak.status = 503
    clock.now += 9.9
    assert await probe() is None  # still the remembered answer
    clock.now += 0.1
    assert await probe() == "Keycloak answered 503"
    assert len(keycloak.urls) == 2


# --- starting up ----------------------------------------------------------------------------


@pytest.fixture
def production(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("HSP_ENVIRONMENT", "production")
    monkeypatch.setenv("HSP_SESSION_ENCRYPTION_KEY", "a" * 43 + "=")
    monkeypatch.setenv("HSP_OIDC_CLIENT_SECRET", "real-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def wrong_schema() -> None:
    raise SchemaMismatchError("the database schema is at old, but this version needs new")


def test_production_refuses_to_start_on_the_wrong_schema(
    production: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(hsp.main, "check_schema_at_startup", wrong_schema)
    with pytest.raises(SchemaMismatchError, match="needs new"), TestClient(create_app()):
        pass
