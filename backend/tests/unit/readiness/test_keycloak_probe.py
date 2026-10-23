"""The Keycloak check behind /readyz: it asks for the discovery document within 2 s, and at most
every 10 s (docs/0105)."""

import httpx2
import pytest

from hsp.readiness import KeycloakProbe

ISSUER = "http://keycloak.test/auth/realms/hsp"
DISCOVERY = f"{ISSUER}/.well-known/openid-configuration"


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
def fake_clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def spy_keycloak() -> SpyKeycloak:
    return SpyKeycloak()


@pytest.fixture
def keycloak_probe(spy_keycloak: SpyKeycloak, fake_clock: FakeClock) -> KeycloakProbe:
    return KeycloakProbe(ISSUER, transport=spy_keycloak.transport(), clock=fake_clock)


async def test_keycloak_is_asked_for_its_discovery_document(
    keycloak_probe: KeycloakProbe, spy_keycloak: SpyKeycloak
) -> None:
    assert await keycloak_probe() is None
    assert spy_keycloak.urls == [DISCOVERY]
    assert spy_keycloak.timeouts == [{"connect": 2, "read": 2, "write": 2, "pool": 2}]


async def test_keycloak_answering_an_error_is_not_ready(
    keycloak_probe: KeycloakProbe, spy_keycloak: SpyKeycloak
) -> None:
    spy_keycloak.status = 503
    assert await keycloak_probe() == "Keycloak answered 503"


async def test_keycloak_unreachable_is_not_ready(
    keycloak_probe: KeycloakProbe, spy_keycloak: SpyKeycloak
) -> None:
    spy_keycloak.status = None
    assert await keycloak_probe() == "Keycloak unreachable (ConnectError)"


async def test_keycloak_is_asked_at_most_every_10_s(
    keycloak_probe: KeycloakProbe, spy_keycloak: SpyKeycloak, fake_clock: FakeClock
) -> None:
    await keycloak_probe()
    spy_keycloak.status = 503
    fake_clock.now += 9.9
    assert await keycloak_probe() is None  # still the remembered answer
    fake_clock.now += 0.1
    assert await keycloak_probe() == "Keycloak answered 503"
    assert len(spy_keycloak.urls) == 2


async def test_keycloak_not_ready_is_asked_again_next_time(
    keycloak_probe: KeycloakProbe, spy_keycloak: SpyKeycloak, fake_clock: FakeClock
) -> None:
    # Each API worker has its own probe: one that remembered Keycloak starting would answer 503
    # for up to 10 s after another worker found it ready.
    spy_keycloak.status = 503
    assert await keycloak_probe() == "Keycloak answered 503"
    spy_keycloak.status = 200
    fake_clock.now += 1
    assert await keycloak_probe() is None
