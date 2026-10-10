"""Edit lock endpoints with an in-memory repository (docs/0016, docs/0033, docs/0041)."""

from collections.abc import Iterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from hsp.api.locks import get_lock_repository
from hsp.auth.dependencies import get_principal
from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.main import create_app
from hsp.models import new_id
from tests.fakes import InMemoryLockRepository

TENANT = new_id()
FLOOR = new_id()
CSRF = {"X-CSRF-Token": "c"}
ALICE = Principal("alice", "Alice", None, frozenset({ADMIN_ROLE}), TENANT, new_id(), "c")
BOB = Principal("bob", "Bob", None, frozenset({ADMIN_ROLE}), TENANT, new_id(), "c")
VIEWER = Principal("vic", "Vic", None, frozenset(), TENANT, new_id(), "c")
URL = f"/api/v1/floors/{FLOOR}/lock"


@pytest.fixture
def repo() -> InMemoryLockRepository:
    r = InMemoryLockRepository(TENANT)
    r.floors[FLOOR] = "active"
    return r


@pytest.fixture
def who() -> dict[str, Principal]:
    return {"p": ALICE}


@pytest.fixture
def client(repo: InMemoryLockRepository, who: dict[str, Principal]) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_lock_repository] = lambda: repo
    app.dependency_overrides[get_principal] = lambda: who["p"]
    with TestClient(app) as c:
        yield c


def expire(repo: InMemoryLockRepository) -> None:
    repo.locks[FLOOR] = replace(
        repo.locks[FLOOR], expires_at=datetime.now(UTC) - timedelta(seconds=1)
    )


def test_acquire_and_status(
    client: TestClient, repo: InMemoryLockRepository, who: dict[str, Principal]
) -> None:
    assert client.get(URL).json()["locked"] is False
    lock = client.post(URL, headers=CSRF).json()
    assert (lock["locked"], lock["holder_name"], lock["is_mine"]) == (True, "Alice", True)
    who["p"] = VIEWER  # everyone sees who is editing (docs/0016)
    seen = client.get(URL).json()
    assert (seen["holder_name"], seen["is_mine"]) == ("Alice", False)
    assert [e.action for e in repo.events] == ["floor.lock_acquired"]


def test_heartbeat_extends_without_audit(client: TestClient, repo: InMemoryLockRepository) -> None:
    first = client.post(URL, headers=CSRF).json()
    repo.locks[FLOOR] = replace(
        repo.locks[FLOOR], expires_at=datetime.now(UTC) + timedelta(seconds=5)
    )
    second = client.post(URL, headers=CSRF).json()
    assert second["acquired_at"] == first["acquired_at"]  # same editing session
    assert second["expires_at"] > first["acquired_at"]
    assert [e.action for e in repo.events] == ["floor.lock_acquired"]  # heartbeats aren't audited


def test_someone_else_editing_is_423(client: TestClient, who: dict[str, Principal]) -> None:
    client.post(URL, headers=CSRF)
    who["p"] = BOB
    r = client.post(URL, headers=CSRF)
    assert r.status_code == 423
    assert r.json()["type"].endswith("/floor-locked")
    assert "Being edited by Alice since" in r.json()["detail"]


def test_expired_lock_can_be_taken_over(
    client: TestClient, repo: InMemoryLockRepository, who: dict[str, Principal]
) -> None:
    client.post(URL, headers=CSRF)
    expire(repo)
    who["p"] = BOB
    assert client.get(URL).json()["locked"] is False  # an expired row counts as free
    lock = client.post(URL, headers=CSRF).json()
    assert lock["holder_name"] == "Bob"
    assert repo.events[-1].after["took_over_expired_lock_of"] == "alice"


def test_viewer_cannot_lock(client: TestClient, who: dict[str, Principal]) -> None:
    who["p"] = VIEWER
    assert client.post(URL, headers=CSRF).status_code == 403


def test_release_own_lock_only(
    client: TestClient, repo: InMemoryLockRepository, who: dict[str, Principal]
) -> None:
    client.post(URL, headers=CSRF)
    who["p"] = BOB
    r = client.delete(URL, headers=CSRF)
    assert r.status_code == 409 and r.json()["type"].endswith("/not-lock-holder")
    who["p"] = ALICE
    assert client.delete(URL, headers=CSRF).status_code == 204
    assert client.delete(URL, headers=CSRF).status_code == 204  # idempotent
    assert client.get(URL).json()["locked"] is False
    assert [e.action for e in repo.events] == ["floor.lock_acquired", "floor.lock_released"]


def test_admin_force_release_is_audited(
    client: TestClient, repo: InMemoryLockRepository, who: dict[str, Principal]
) -> None:
    client.post(URL, headers=CSRF)
    who["p"] = BOB
    assert client.post(f"{URL}/force-release", headers=CSRF).status_code == 204
    assert client.get(URL).json()["locked"] is False
    event = repo.events[-1]
    assert (event.action, event.actor_subject) == ("floor.lock_force_released", "bob")
    assert event.before == {"holder_subject": "alice", "holder_name": "Alice"}


def test_archived_or_unknown_floor(client: TestClient, repo: InMemoryLockRepository) -> None:
    repo.floors[FLOOR] = "archived"
    assert client.post(URL, headers=CSRF).status_code == 409
    assert client.get(f"/api/v1/floors/{new_id()}/lock").status_code == 404
