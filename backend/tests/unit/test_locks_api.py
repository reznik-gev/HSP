"""Edit lock endpoints with an in-memory repository (docs/0016, docs/0033, docs/0041)."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hsp.api.locks import get_lock_repository
from hsp.auth.principal import Principal
from hsp.models import new_id
from tests.fakes import InMemoryLockRepository
from tests.stubs import STUB_TENANT
from tests.unit.api_helpers import SignedIn

FLOOR = new_id()
URL = f"/api/v1/floors/{FLOOR}/lock"

pytestmark = pytest.mark.usefixtures("lock_repo")


@pytest.fixture
def lock_repo(app: FastAPI) -> InMemoryLockRepository:
    """In-memory locks of one active floor, FLOOR, plugged into the app."""
    repo = InMemoryLockRepository(STUB_TENANT)
    repo.floors[FLOOR] = "active"
    app.dependency_overrides[get_lock_repository] = lambda: repo
    return repo


def expire_lock(repo: InMemoryLockRepository, in_seconds: int = -1) -> None:
    """Move FLOOR's lock expiry to `in_seconds` from now; by default, just past."""
    repo.locks[FLOOR] = replace(
        repo.locks[FLOOR], expires_at=datetime.now(UTC) + timedelta(seconds=in_seconds)
    )


def test_acquire_and_status(
    api: TestClient, lock_repo: InMemoryLockRepository, signed_in: SignedIn, viewer: Principal
) -> None:
    assert api.get(URL).json()["locked"] is False
    lock = api.post(URL).json()
    assert (lock["locked"], lock["holder_name"], lock["is_mine"]) == (True, "Alice", True)
    signed_in.principal = viewer  # everyone sees who is editing (docs/0016)
    seen = api.get(URL).json()
    assert (seen["holder_name"], seen["is_mine"]) == ("Alice", False)
    assert [e.action for e in lock_repo.events] == ["floor.lock_acquired"]


def test_heartbeat_extends_without_audit(
    api: TestClient, lock_repo: InMemoryLockRepository
) -> None:
    first = api.post(URL).json()
    expire_lock(lock_repo, in_seconds=5)
    second = api.post(URL).json()
    assert second["acquired_at"] == first["acquired_at"]  # same editing session
    assert second["expires_at"] > first["acquired_at"]
    assert [e.action for e in lock_repo.events] == [
        "floor.lock_acquired"
    ]  # heartbeats aren't audited


def test_someone_else_editing_is_423(
    api: TestClient, signed_in: SignedIn, other_admin: Principal
) -> None:
    api.post(URL)
    signed_in.principal = other_admin
    r = api.post(URL)
    assert r.status_code == 423
    assert r.json()["type"].endswith("/floor-locked")
    assert "Being edited by Alice since" in r.json()["detail"]


def test_expired_lock_can_be_taken_over(
    api: TestClient,
    lock_repo: InMemoryLockRepository,
    signed_in: SignedIn,
    other_admin: Principal,
) -> None:
    api.post(URL)
    expire_lock(lock_repo)
    signed_in.principal = other_admin
    assert api.get(URL).json()["locked"] is False  # an expired row counts as free
    lock = api.post(URL).json()
    assert lock["holder_name"] == "Bob"
    assert lock_repo.events[-1].after["took_over_expired_lock_of"] == "alice"


def test_viewer_cannot_lock(api: TestClient, signed_in: SignedIn, viewer: Principal) -> None:
    signed_in.principal = viewer
    assert api.post(URL).status_code == 403


def test_release_own_lock_only(
    api: TestClient,
    lock_repo: InMemoryLockRepository,
    signed_in: SignedIn,
    admin: Principal,
    other_admin: Principal,
) -> None:
    api.post(URL)
    signed_in.principal = other_admin
    r = api.delete(URL)
    assert r.status_code == 409 and r.json()["type"].endswith("/not-lock-holder")
    signed_in.principal = admin
    assert api.delete(URL).status_code == 204
    assert api.delete(URL).status_code == 204  # idempotent
    assert api.get(URL).json()["locked"] is False
    assert [e.action for e in lock_repo.events] == ["floor.lock_acquired", "floor.lock_released"]


def test_admin_force_release_is_audited(
    api: TestClient,
    lock_repo: InMemoryLockRepository,
    signed_in: SignedIn,
    other_admin: Principal,
) -> None:
    api.post(URL)
    signed_in.principal = other_admin
    assert api.post(f"{URL}/force-release").status_code == 204
    assert api.get(URL).json()["locked"] is False
    event = lock_repo.events[-1]
    assert (event.action, event.actor_subject) == ("floor.lock_force_released", "bob")
    assert event.before == {"holder_subject": "alice", "holder_name": "Alice"}


def test_archived_or_unknown_floor(api: TestClient, lock_repo: InMemoryLockRepository) -> None:
    lock_repo.floors[FLOOR] = "archived"
    assert api.post(URL).status_code == 409
    assert api.get(f"/api/v1/floors/{new_id()}/lock").status_code == 404
