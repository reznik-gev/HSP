"""/api/v1/floors with an in-memory repository (docs/0029, 0035, 0033, 0078)."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from hsp.api.common import get_locations_repository
from hsp.auth.dependencies import get_principal
from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.main import create_app
from hsp.models import new_id
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


@pytest.fixture
def building_id(client: TestClient) -> str:
    site = client.post(
        "/api/v1/sites", json={"name": "HQ", "time_zone": "UTC"}, headers=CSRF
    ).json()
    b = client.post(
        "/api/v1/buildings", json={"site_id": site["id"], "name": "Main", "code": "A"}, headers=CSRF
    ).json()
    bid: str = b["id"]
    return bid


def floor(
    client: TestClient, building_id: str, level: int, expect: int = 201, **extra: Any
) -> dict[str, Any]:
    r = client.post(
        "/api/v1/floors",
        json={"building_id": building_id, "name": f"L{level}", "level_index": level, **extra},
        headers=CSRF,
    )
    assert r.status_code == expect, r.text
    body: dict[str, Any] = r.json()
    return body


def test_create_with_defaults(client: TestClient, building_id: str) -> None:
    f = floor(client, building_id, 0)
    assert (f["elevation_mm"], f["default_wall_height_mm"], f["origin_x_mm"]) == (0, 2800, 0)
    assert f["published_version"] is None
    b1 = floor(client, building_id, -1, elevation_mm=-3500)
    assert b1["elevation_mm"] == -3500


def test_levels_unique_per_building_including_archived(
    client: TestClient, building_id: str
) -> None:
    f0 = floor(client, building_id, 0)
    assert (
        client.post(
            "/api/v1/floors",
            json={"building_id": building_id, "name": "x", "level_index": 0},
            headers=CSRF,
        )
        .json()["type"]
        .endswith("/level-taken")
    )
    client.delete(f"/api/v1/floors/{f0['id']}", headers=CSRF)
    r = client.post(
        "/api/v1/floors",
        json={"building_id": building_id, "name": "x", "level_index": 0},
        headers=CSRF,
    )
    assert r.status_code == 409
    assert "archived floor" in r.json()["detail"]


def test_mm_fields_are_integers_and_bounded(client: TestClient, building_id: str) -> None:
    floor(client, building_id, 1, expect=422, elevation_mm=3.5)  # whole millimetres only
    floor(client, building_id, 1, expect=422, default_wall_height_mm=500)
    floor(client, building_id, 999, expect=422)


def test_patch_and_level_move(
    client: TestClient, building_id: str, repo: InMemoryLocationsRepository
) -> None:
    floor(client, building_id, 0)
    f1 = floor(client, building_id, 1)
    assert (
        client.patch(
            f"/api/v1/floors/{f1['id']}", json={"level_index": 0}, headers=CSRF
        ).status_code
        == 409
    )
    r = client.patch(
        f"/api/v1/floors/{f1['id']}", json={"level_index": 2, "name": "Second"}, headers=CSRF
    )
    assert (r.json()["level_index"], r.json()["name"]) == (2, "Second")
    event = repo.events[-1]
    assert event.before == {"level_index": 1, "name": "L1"}
    assert event.after == {"level_index": 2, "name": "Second"}


def test_published_version_is_not_patchable(client: TestClient, building_id: str) -> None:
    f = floor(client, building_id, 0)
    r = client.patch(f"/api/v1/floors/{f['id']}", json={"published_version": 7}, headers=CSRF)
    assert r.status_code == 200
    assert r.json()["published_version"] is None  # unknown fields are ignored


def test_floor_blocks_building_archive_and_restore_is_top_down(
    client: TestClient, building_id: str
) -> None:
    f = floor(client, building_id, 0)
    assert client.delete(f"/api/v1/buildings/{building_id}", headers=CSRF).status_code == 409
    assert client.delete(f"/api/v1/floors/{f['id']}", headers=CSRF).status_code == 204
    assert client.delete(f"/api/v1/buildings/{building_id}", headers=CSRF).status_code == 204
    assert client.post(f"/api/v1/floors/{f['id']}/restore", headers=CSRF).status_code == 409
    assert client.post(f"/api/v1/buildings/{building_id}/restore", headers=CSRF).status_code == 200
    assert (
        client.post(f"/api/v1/floors/{f['id']}/restore", headers=CSRF).json()["archived_at"] is None
    )


def test_list_by_building(client: TestClient, building_id: str) -> None:
    for level in (0, 1, 2):
        floor(client, building_id, level)
    items = client.get("/api/v1/floors", params={"building_id": building_id}).json()["items"]
    assert sorted(f["level_index"] for f in items) == [0, 1, 2]


def test_archive_refused_while_floor_is_being_edited(
    client: TestClient, building_id: str, repo: InMemoryLocationsRepository
) -> None:
    import uuid

    f = floor(client, building_id, 0)
    repo.lock_holders[uuid.UUID(f["id"])] = "Alice"
    r = client.delete(f"/api/v1/floors/{f['id']}", headers=CSRF)
    assert r.status_code == 409
    assert r.json()["type"].endswith("/floor-locked")
    assert "Alice is editing" in r.json()["detail"]
