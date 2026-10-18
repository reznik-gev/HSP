"""/api/v1/buildings with an in-memory repository (docs/0035, 0033, 0078)."""

import uuid

import pytest
from fastapi.testclient import TestClient

from hsp.models import SeatAssignment, new_id
from tests.fakes import InMemoryLocationsRepository
from tests.stubs import STUB_CSRF_HEADER, STUB_TENANT
from tests.unit.api_helpers import create_building, create_floor, create_site

pytestmark = pytest.mark.usefixtures("locations_repo")

SEAT, PERSON = new_id(), new_id()


def assignment_of_seat_to_person() -> SeatAssignment:
    """SEAT held by PERSON, wherever a test puts it."""
    return SeatAssignment(
        id=new_id(),
        tenant_id=STUB_TENANT,
        seat_element_id=SEAT,
        holder_person_id=PERSON,
        assigned_by="alice",
    )


@pytest.fixture
def site_id(api: TestClient) -> str:
    sid: str = create_site(api)["id"]
    return sid


def test_create_list_filter_by_site(api: TestClient) -> None:
    s1, s2 = create_site(api)["id"], create_site(api)["id"]
    create_building(api, s1, "A")
    create_building(api, s1, "B")
    create_building(api, s2, "A")  # same code, other site: fine
    assert len(api.get("/api/v1/buildings").json()["items"]) == 3
    only_s1 = api.get("/api/v1/buildings", params={"site_id": s1}).json()["items"]
    assert [b["code"] for b in only_s1] == ["A", "B"]


def test_duplicate_code_in_site_is_409(api: TestClient, site_id: str) -> None:
    a = create_building(api, site_id, "A")
    r = api.post(
        "/api/v1/buildings",
        json={"site_id": site_id, "name": "x", "code": "A"},
        headers=STUB_CSRF_HEADER,
    )
    assert r.status_code == 409
    assert r.json()["type"].endswith("/code-taken")
    # Renaming another building to a taken code is refused too; keeping one's own code is fine.
    b = create_building(api, site_id, "B")
    to_a = {"code": "A"}
    assert (
        api.patch(f"/api/v1/buildings/{b['id']}", json=to_a, headers=STUB_CSRF_HEADER).status_code
        == 409
    )
    assert (
        api.patch(f"/api/v1/buildings/{a['id']}", json=to_a, headers=STUB_CSRF_HEADER).status_code
        == 200
    )


def test_archived_building_still_owns_its_code(api: TestClient, site_id: str) -> None:
    a = create_building(api, site_id, "A")
    api.delete(f"/api/v1/buildings/{a['id']}", headers=STUB_CSRF_HEADER)
    r = api.post(
        "/api/v1/buildings",
        json={"site_id": site_id, "name": "x", "code": "A"},
        headers=STUB_CSRF_HEADER,
    )
    assert r.status_code == 409
    assert "archived building" in r.json()["detail"]


def test_unknown_or_archived_site(api: TestClient, site_id: str) -> None:
    r = api.post(
        "/api/v1/buildings",
        json={"site_id": str(new_id()), "name": "x", "code": "A"},
        headers=STUB_CSRF_HEADER,
    )
    assert r.status_code == 422
    assert r.json()["errors"][0]["pointer"] == "/site_id"
    api.delete(f"/api/v1/sites/{site_id}", headers=STUB_CSRF_HEADER)
    r = api.post(
        "/api/v1/buildings",
        json={"site_id": site_id, "name": "x", "code": "A"},
        headers=STUB_CSRF_HEADER,
    )
    assert r.status_code == 409
    assert r.json()["type"].endswith("/parent-archived")


def test_invalid_code_format_is_422(api: TestClient, site_id: str) -> None:
    create_building(api, site_id, "bad code!", expect=422)


def test_archive_cascades_to_floors_and_frees_their_seats(
    api: TestClient, site_id: str, locations_repo: InMemoryLocationsRepository
) -> None:
    b = create_building(api, site_id)
    floor = create_floor(api, b["id"], 0)
    locations_repo.seat_assignments[uuid.UUID(floor["id"])] = [assignment_of_seat_to_person()]
    r = api.delete(f"/api/v1/buildings/{b['id']}", headers=STUB_CSRF_HEADER)
    assert r.status_code == 200
    body = r.json()
    assert [a["name"] for a in body["archived"]] == ["Building A (Building A)", "L0"]
    assert body["freed_seats"] == [
        {"seat_id": str(SEAT), "holder_person_id": str(PERSON), "holder_unit_id": None}
    ]
    assert [e.action for e in locations_repo.events][-3:] == [
        "building.archived",
        "floor.archived",
        "seat.unassigned",
    ]


def test_restore_is_top_down(
    api: TestClient, site_id: str, locations_repo: InMemoryLocationsRepository
) -> None:
    b = create_building(api, site_id)
    assert api.delete(f"/api/v1/buildings/{b['id']}", headers=STUB_CSRF_HEADER).status_code == 200
    assert api.delete(f"/api/v1/sites/{site_id}", headers=STUB_CSRF_HEADER).status_code == 200
    restore_building = f"/api/v1/buildings/{b['id']}/restore"
    assert api.post(restore_building, headers=STUB_CSRF_HEADER).status_code == 409
    assert api.post(f"/api/v1/sites/{site_id}/restore", headers=STUB_CSRF_HEADER).status_code == 200
    assert api.post(restore_building, headers=STUB_CSRF_HEADER).status_code == 200
    actions = [e.action for e in locations_repo.events if e.entity_type == "building"]
    assert actions == ["building.created", "building.archived", "building.restored"]
