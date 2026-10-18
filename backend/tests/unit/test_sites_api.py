"""/api/v1/sites with an in-memory repository (docs/0035, 0040, 0033, 0078)."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from hsp.models import new_id
from tests.fakes import InMemoryLocationsRepository
from tests.stubs import STUB_CSRF_HEADER, STUB_VIEWER, stub_admin
from tests.unit.api_helpers import SignedIn, create_building, create_site

pytestmark = pytest.mark.usefixtures("locations_repo")

ADMIN_OF_OTHER_TENANT = stub_admin(new_id())


def all_site_ids(api: TestClient, limit: int) -> list[str]:
    """Every site id, read page by page by following `next_cursor`."""
    seen: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    while True:
        page = api.get("/api/v1/sites", params=params).json()
        seen += [s["id"] for s in page["items"]]
        if not page["next_cursor"]:
            return seen
        params["cursor"] = page["next_cursor"]


def test_create_get_and_audit(api: TestClient, locations_repo: InMemoryLocationsRepository) -> None:
    site = create_site(api, "HQ", "Europe/Berlin")
    assert api.get(f"/api/v1/sites/{site['id']}").json()["name"] == "HQ"
    assert [e.action for e in locations_repo.events] == ["site.created"]
    assert locations_repo.events[0].after == {
        "name": "HQ",
        "address": None,
        "time_zone": "Europe/Berlin",
        "archived_at": None,
    }


def test_unknown_time_zone_is_422_with_pointer(api: TestClient) -> None:
    r = api.post(
        "/api/v1/sites", json={"name": "X", "time_zone": "Mars/Olympus"}, headers=STUB_CSRF_HEADER
    )
    assert r.status_code == 422
    assert r.json()["errors"][0] == {
        "code": "time_zone_unknown",
        "message": "Unknown IANA time zone: Mars/Olympus",
        "pointer": "/time_zone",
    }


def test_writes_need_admin_and_csrf(api: TestClient, signed_in: SignedIn) -> None:
    assert api.post("/api/v1/sites", json={"name": "X", "time_zone": "UTC"}).status_code == 403
    signed_in.principal = STUB_VIEWER
    r = api.post("/api/v1/sites", json={"name": "X", "time_zone": "UTC"}, headers=STUB_CSRF_HEADER)
    assert r.status_code == 403
    assert api.get("/api/v1/sites").status_code == 200  # viewers can read (docs/0027)


def test_patch_audits_only_changed_fields(
    api: TestClient, locations_repo: InMemoryLocationsRepository
) -> None:
    site = create_site(api, "HQ")
    r = api.patch(
        f"/api/v1/sites/{site['id']}",
        json={"name": "Head office", "time_zone": "UTC"},
        headers=STUB_CSRF_HEADER,
    )
    assert r.json()["name"] == "Head office"
    event = locations_repo.events[-1]
    assert (event.action, event.before, event.after) == (
        "site.updated",
        {"name": "HQ"},
        {"name": "Head office"},
    )


def test_noop_patch_writes_nothing(
    api: TestClient, locations_repo: InMemoryLocationsRepository
) -> None:
    site = create_site(api, "HQ")
    commits = locations_repo.committed
    api.patch(f"/api/v1/sites/{site['id']}", json={"name": "HQ"}, headers=STUB_CSRF_HEADER)
    assert locations_repo.committed == commits


def test_archive_restore_and_listing(api: TestClient) -> None:
    site = create_site(api)
    archived = api.delete(f"/api/v1/sites/{site['id']}", headers=STUB_CSRF_HEADER)
    assert [a["id"] for a in archived.json()["archived"]] == [site["id"]]
    again = api.delete(f"/api/v1/sites/{site['id']}", headers=STUB_CSRF_HEADER)
    assert (again.status_code, again.json()["archived"]) == (200, [])  # idempotent
    assert api.get("/api/v1/sites").json()["items"] == []
    archived = api.get("/api/v1/sites", params={"include_archived": True}).json()["items"]
    assert archived[0]["archived_at"] is not None
    r = api.patch(f"/api/v1/sites/{site['id']}", json={"name": "X"}, headers=STUB_CSRF_HEADER)
    assert r.status_code == 409  # archived is read-only
    restored = api.post(f"/api/v1/sites/{site['id']}/restore", headers=STUB_CSRF_HEADER)
    assert restored.json()["archived_at"] is None
    assert len(api.get("/api/v1/sites").json()["items"]) == 1


def test_archive_cascades_to_active_buildings(
    api: TestClient, locations_repo: InMemoryLocationsRepository
) -> None:
    site = create_site(api)
    building = create_building(api, site["id"])
    r = api.delete(f"/api/v1/sites/{site['id']}", headers=STUB_CSRF_HEADER)
    assert r.status_code == 200  # docs/0086: no more bottom-up archiving
    assert [(a["kind"], a["id"]) for a in r.json()["archived"]] == [
        ("site", site["id"]),
        ("building", building["id"]),
    ]
    cascaded = [e for e in locations_repo.events if str(e.entity_id) == building["id"]]
    assert [e.action for e in cascaded] == ["building.created", "building.archived"]
    assert cascaded[-1].reason is not None


def test_cursor_pagination(api: TestClient) -> None:
    ids = [create_site(api, f"S{i}")["id"] for i in range(5)]
    assert all_site_ids(api, limit=2) == ids


def test_cursor_from_other_filters_is_rejected(api: TestClient) -> None:
    for i in range(3):
        create_site(api, f"S{i}")
    cursor = api.get("/api/v1/sites", params={"limit": 1}).json()["next_cursor"]
    r = api.get("/api/v1/sites", params={"limit": 1, "cursor": cursor, "include_archived": True})
    assert r.status_code == 400
    assert api.get("/api/v1/sites", params={"cursor": "garbage"}).status_code == 400


def test_other_tenants_sites_are_invisible(api: TestClient, signed_in: SignedIn) -> None:
    site = create_site(api)
    signed_in.principal = ADMIN_OF_OTHER_TENANT
    assert api.get(f"/api/v1/sites/{site['id']}").status_code == 404
    assert api.get("/api/v1/sites").json()["items"] == []
