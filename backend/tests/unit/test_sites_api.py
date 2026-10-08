"""/api/v1/sites with an in-memory repository (docs/0035, 0040, 0033, 0078)."""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from hsp.api.common import get_locations_repository
from hsp.auth.dependencies import get_principal
from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.main import create_app
from hsp.models import Building, new_id
from tests.fakes import InMemoryLocationsRepository

TENANT = new_id()
CSRF = {"X-CSRF-Token": "csrf"}


def principal(*roles: str, tenant: Any = TENANT) -> Principal:
    return Principal(
        subject="u1",
        name="Dev",
        email=None,
        roles=frozenset(roles),
        tenant_id=tenant,
        session_id=new_id(),
        csrf_token="csrf",
    )


@pytest.fixture
def repo() -> InMemoryLocationsRepository:
    return InMemoryLocationsRepository()


@pytest.fixture
def as_user() -> dict[str, Principal]:
    return {"p": principal(ADMIN_ROLE)}


@pytest.fixture
def client(
    repo: InMemoryLocationsRepository, as_user: dict[str, Principal]
) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_locations_repository] = lambda: repo
    app.dependency_overrides[get_principal] = lambda: as_user["p"]
    with TestClient(app) as c:
        yield c


def create(client: TestClient, name: str = "HQ", tz: str = "Europe/Berlin") -> dict[str, Any]:
    r = client.post("/api/v1/sites", json={"name": name, "time_zone": tz}, headers=CSRF)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_get_and_audit(client: TestClient, repo: InMemoryLocationsRepository) -> None:
    site = create(client)
    assert client.get(f"/api/v1/sites/{site['id']}").json()["name"] == "HQ"
    assert [e.action for e in repo.events] == ["site.created"]
    assert repo.events[0].after == {
        "name": "HQ",
        "address": None,
        "time_zone": "Europe/Berlin",
        "archived_at": None,
    }


def test_unknown_time_zone_is_422_with_pointer(client: TestClient) -> None:
    r = client.post("/api/v1/sites", json={"name": "X", "time_zone": "Mars/Olympus"}, headers=CSRF)
    assert r.status_code == 422
    assert r.json()["errors"][0] == {
        "code": "time_zone_unknown",
        "message": "Unknown IANA time zone: Mars/Olympus",
        "pointer": "/time_zone",
    }


def test_writes_need_admin_and_csrf(client: TestClient, as_user: dict[str, Principal]) -> None:
    assert client.post("/api/v1/sites", json={"name": "X", "time_zone": "UTC"}).status_code == 403
    as_user["p"] = principal("default-roles-hsp")
    r = client.post("/api/v1/sites", json={"name": "X", "time_zone": "UTC"}, headers=CSRF)
    assert r.status_code == 403
    assert client.get("/api/v1/sites").status_code == 200  # viewers can read (docs/0027)


def test_patch_audits_only_changed_fields(
    client: TestClient, repo: InMemoryLocationsRepository
) -> None:
    site = create(client)
    r = client.patch(
        f"/api/v1/sites/{site['id']}",
        json={"name": "Head office", "time_zone": "Europe/Berlin"},
        headers=CSRF,
    )
    assert r.json()["name"] == "Head office"
    event = repo.events[-1]
    assert (event.action, event.before, event.after) == (
        "site.updated",
        {"name": "HQ"},
        {"name": "Head office"},
    )


def test_noop_patch_writes_nothing(client: TestClient, repo: InMemoryLocationsRepository) -> None:
    site = create(client)
    commits = repo.committed
    client.patch(f"/api/v1/sites/{site['id']}", json={"name": "HQ"}, headers=CSRF)
    assert repo.committed == commits


def test_archive_restore_and_listing(client: TestClient) -> None:
    site = create(client)
    assert client.delete(f"/api/v1/sites/{site['id']}", headers=CSRF).status_code == 204
    assert (
        client.delete(f"/api/v1/sites/{site['id']}", headers=CSRF).status_code == 204
    )  # idempotent
    assert client.get("/api/v1/sites").json()["items"] == []
    archived = client.get("/api/v1/sites", params={"include_archived": True}).json()["items"]
    assert archived[0]["archived_at"] is not None
    r = client.patch(f"/api/v1/sites/{site['id']}", json={"name": "X"}, headers=CSRF)
    assert r.status_code == 409  # archived is read-only
    assert (
        client.post(f"/api/v1/sites/{site['id']}/restore", headers=CSRF).json()["archived_at"]
        is None
    )
    assert len(client.get("/api/v1/sites").json()["items"]) == 1


def test_archive_blocked_by_active_building(
    client: TestClient, repo: InMemoryLocationsRepository
) -> None:
    site = create(client)
    b = Building(
        id=new_id(),
        tenant_id=TENANT,
        site_id=uuid.UUID(site["id"]),
        name="Main",
        code="A",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        archived_at=None,
    )
    repo.buildings[b.id] = b
    r = client.delete(f"/api/v1/sites/{site['id']}", headers=CSRF)
    assert r.status_code == 409
    assert r.json()["type"].endswith("/has-active-children")
    assert r.json()["errors"][0]["element_id"] == str(b.id)


def test_cursor_pagination(client: TestClient) -> None:
    ids = [create(client, f"S{i}")["id"] for i in range(5)]
    seen: list[str] = []
    cursor = None
    while True:
        params: dict[str, Any] = {"limit": 2}
        if cursor:
            params["cursor"] = cursor
        page = client.get("/api/v1/sites", params=params).json()
        seen += [s["id"] for s in page["items"]]
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert seen == ids


def test_cursor_from_other_filters_is_rejected(client: TestClient) -> None:
    for i in range(3):
        create(client, f"S{i}")
    cursor = client.get("/api/v1/sites", params={"limit": 1}).json()["next_cursor"]
    r = client.get("/api/v1/sites", params={"limit": 1, "cursor": cursor, "include_archived": True})
    assert r.status_code == 400
    assert client.get("/api/v1/sites", params={"cursor": "garbage"}).status_code == 400


def test_other_tenants_sites_are_invisible(
    client: TestClient, as_user: dict[str, Principal]
) -> None:
    site = create(client)
    as_user["p"] = principal(ADMIN_ROLE, tenant=new_id())
    assert client.get(f"/api/v1/sites/{site['id']}").status_code == 404
    assert client.get("/api/v1/sites").json()["items"] == []
