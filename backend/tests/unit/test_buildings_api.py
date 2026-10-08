"""/api/v1/buildings with an in-memory repository (docs/0035, 0033, 0078)."""

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
from hsp.models import Floor, new_id
from tests.fakes import InMemoryLocationsRepository

TENANT = new_id()
CSRF = {"X-CSRF-Token": "csrf"}
ADMIN = Principal("u1", "Dev", None, frozenset({ADMIN_ROLE}), TENANT, new_id(), "csrf")


@pytest.fixture
def repo() -> InMemoryLocationsRepository:
    return InMemoryLocationsRepository()


@pytest.fixture
def client(repo: InMemoryLocationsRepository) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_locations_repository] = lambda: repo
    app.dependency_overrides[get_principal] = lambda: ADMIN
    with TestClient(app) as c:
        yield c


def site(client: TestClient) -> str:
    r = client.post("/api/v1/sites", json={"name": "HQ", "time_zone": "UTC"}, headers=CSRF)
    sid: str = r.json()["id"]
    return sid


def building(
    client: TestClient, site_id: str, code: str = "A", expect: int = 201
) -> dict[str, Any]:
    r = client.post(
        "/api/v1/buildings",
        json={"site_id": site_id, "name": f"Building {code}", "code": code},
        headers=CSRF,
    )
    assert r.status_code == expect, r.text
    body: dict[str, Any] = r.json()
    return body


def test_create_list_filter_by_site(client: TestClient) -> None:
    s1, s2 = site(client), site(client)
    building(client, s1, "A")
    building(client, s1, "B")
    building(client, s2, "A")  # same code, other site: fine
    assert len(client.get("/api/v1/buildings").json()["items"]) == 3
    only_s1 = client.get("/api/v1/buildings", params={"site_id": s1}).json()["items"]
    assert [b["code"] for b in only_s1] == ["A", "B"]


def test_duplicate_code_in_site_is_409(client: TestClient) -> None:
    s = site(client)
    a = building(client, s, "A")
    r = client.post(
        "/api/v1/buildings", json={"site_id": s, "name": "x", "code": "A"}, headers=CSRF
    )
    assert r.status_code == 409
    assert r.json()["type"].endswith("/code-taken")
    # Renaming another building to a taken code is refused too; keeping one's own code is fine.
    b = building(client, s, "B")
    assert (
        client.patch(f"/api/v1/buildings/{b['id']}", json={"code": "A"}, headers=CSRF).status_code
        == 409
    )
    assert (
        client.patch(f"/api/v1/buildings/{a['id']}", json={"code": "A"}, headers=CSRF).status_code
        == 200
    )


def test_archived_building_still_owns_its_code(client: TestClient) -> None:
    s = site(client)
    a = building(client, s, "A")
    client.delete(f"/api/v1/buildings/{a['id']}", headers=CSRF)
    r = client.post(
        "/api/v1/buildings", json={"site_id": s, "name": "x", "code": "A"}, headers=CSRF
    )
    assert r.status_code == 409
    assert "archived building" in r.json()["detail"]


def test_unknown_or_archived_site(client: TestClient) -> None:
    r = client.post(
        "/api/v1/buildings", json={"site_id": str(new_id()), "name": "x", "code": "A"}, headers=CSRF
    )
    assert r.status_code == 422
    assert r.json()["errors"][0]["pointer"] == "/site_id"
    s = site(client)
    client.delete(f"/api/v1/sites/{s}", headers=CSRF)
    r = client.post(
        "/api/v1/buildings", json={"site_id": s, "name": "x", "code": "A"}, headers=CSRF
    )
    assert r.status_code == 409
    assert r.json()["type"].endswith("/parent-archived")


def test_invalid_code_format_is_422(client: TestClient) -> None:
    building(client, site(client), "bad code!", expect=422)


def test_archive_blocked_by_active_floor(
    client: TestClient, repo: InMemoryLocationsRepository
) -> None:
    b = building(client, site(client))
    now = datetime.now(UTC)
    floor = Floor(
        id=new_id(),
        tenant_id=TENANT,
        building_id=uuid.UUID(b["id"]),
        name="Ground",
        level_index=0,
        elevation_mm=0,
        default_wall_height_mm=2800,
        origin_x_mm=0,
        origin_y_mm=0,
        published_version=None,
        created_at=now,
        updated_at=now,
        archived_at=None,
    )
    repo.floors[floor.id] = floor
    r = client.delete(f"/api/v1/buildings/{b['id']}", headers=CSRF)
    assert r.status_code == 409
    assert r.json()["errors"][0]["message"] == "Floor Ground (level 0)"


def test_restore_is_top_down(client: TestClient, repo: InMemoryLocationsRepository) -> None:
    s = site(client)
    b = building(client, s)
    assert client.delete(f"/api/v1/buildings/{b['id']}", headers=CSRF).status_code == 204
    assert client.delete(f"/api/v1/sites/{s}", headers=CSRF).status_code == 204  # now empty
    assert client.post(f"/api/v1/buildings/{b['id']}/restore", headers=CSRF).status_code == 409
    assert client.post(f"/api/v1/sites/{s}/restore", headers=CSRF).status_code == 200
    assert client.post(f"/api/v1/buildings/{b['id']}/restore", headers=CSRF).status_code == 200
    actions = [e.action for e in repo.events if e.entity_type == "building"]
    assert actions == ["building.created", "building.archived", "building.restored"]
