"""/api/v1/floors with an in-memory repository (docs/0029, 0035, 0033, 0078)."""

import uuid

import pytest
from fastapi.testclient import TestClient

from tests.fakes import InMemoryLocationsRepository
from tests.unit.api_helpers import create_building, create_floor, create_site

pytestmark = pytest.mark.usefixtures("locations_repo")


@pytest.fixture
def building_id(api: TestClient) -> str:
    bid: str = create_building(api, create_site(api)["id"])["id"]
    return bid


def test_create_with_defaults(api: TestClient, building_id: str) -> None:
    f = create_floor(api, building_id, 0)
    assert (f["elevation_mm"], f["default_wall_height_mm"], f["origin_x_mm"]) == (0, 2800, 0)
    assert f["published_version"] is None
    b1 = create_floor(api, building_id, -1, elevation_mm=-3500)
    assert b1["elevation_mm"] == -3500


def test_levels_unique_per_building_including_archived(api: TestClient, building_id: str) -> None:
    f0 = create_floor(api, building_id, 0)
    assert create_floor(api, building_id, 0, expect=409)["type"].endswith("/level-taken")
    api.delete(f"/api/v1/floors/{f0['id']}")
    assert "archived floor" in create_floor(api, building_id, 0, expect=409)["detail"]


def test_mm_fields_are_integers_and_bounded(api: TestClient, building_id: str) -> None:
    create_floor(api, building_id, 1, expect=422, elevation_mm=3.5)  # whole millimetres only
    create_floor(api, building_id, 1, expect=422, default_wall_height_mm=500)
    create_floor(api, building_id, 999, expect=422)


def test_patch_and_level_move(
    api: TestClient, building_id: str, locations_repo: InMemoryLocationsRepository
) -> None:
    create_floor(api, building_id, 0)
    f1 = create_floor(api, building_id, 1)
    url = f"/api/v1/floors/{f1['id']}"
    assert api.patch(url, json={"level_index": 0}).status_code == 409
    r = api.patch(url, json={"level_index": 2, "name": "Second"})
    assert (r.json()["level_index"], r.json()["name"]) == (2, "Second")
    event = locations_repo.events[-1]
    assert event.before == {"level_index": 1, "name": "L1"}
    assert event.after == {"level_index": 2, "name": "Second"}


def test_published_version_is_not_patchable(api: TestClient, building_id: str) -> None:
    f = create_floor(api, building_id, 0)
    r = api.patch(f"/api/v1/floors/{f['id']}", json={"published_version": 7})
    assert r.status_code == 200
    assert r.json()["published_version"] is None  # unknown fields are ignored


def test_building_archive_cascades_and_restore_is_top_down(
    api: TestClient, building_id: str
) -> None:
    f = create_floor(api, building_id, 0)
    r = api.delete(f"/api/v1/buildings/{building_id}")
    assert [a["id"] for a in r.json()["archived"]] == [building_id, f["id"]]  # docs/0086
    restore_floor = f"/api/v1/floors/{f['id']}/restore"
    assert api.post(restore_floor).status_code == 409
    restore_building = f"/api/v1/buildings/{building_id}/restore"
    assert api.post(restore_building).status_code == 200
    floors = api.get("/api/v1/floors", params={"building_id": building_id}).json()["items"]
    assert floors == []  # restoring the building doesn't bring its floors back
    assert api.post(restore_floor).json()["archived_at"] is None


def test_list_by_building(api: TestClient, building_id: str) -> None:
    for level in (0, 1, 2):
        create_floor(api, building_id, level)
    items = api.get("/api/v1/floors", params={"building_id": building_id}).json()["items"]
    assert sorted(f["level_index"] for f in items) == [0, 1, 2]


def test_archive_refused_while_floor_is_being_edited(
    api: TestClient, building_id: str, locations_repo: InMemoryLocationsRepository
) -> None:
    f = create_floor(api, building_id, 0)
    locations_repo.lock_holders[uuid.UUID(f["id"])] = "Alice"
    r = api.delete(f"/api/v1/floors/{f['id']}")
    assert r.status_code == 409
    assert r.json()["type"].endswith("/floor-locked")
    assert "Alice is editing" in r.json()["detail"]
    # A cascade from the building is refused too: the lock protects unsaved work (docs/0086).
    r = api.delete(f"/api/v1/buildings/{building_id}")
    assert r.status_code == 409
    assert r.json()["errors"][0]["element_id"] == f["id"]
