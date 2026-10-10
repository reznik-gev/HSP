"""Floor-plan read endpoints with an in-memory repository: visibility rules of docs/0080."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from hsp.api.plans import get_plan_repository
from hsp.auth.dependencies import get_principal
from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.main import create_app
from hsp.models import new_id
from hsp.plans.schema import FloorVersion, PlacedObject, PlanContent
from tests.fakes import InMemoryPlanRepository

TENANT = new_id()
FLOOR = new_id()
DESK = new_id()
DESK_REV = new_id()  # same catalog revision in every version
ADMIN = Principal("a", "Admin", None, frozenset({ADMIN_ROLE}), TENANT, new_id(), "c")
VIEWER = Principal("v", "Viewer", None, frozenset(), TENANT, new_id(), "c")


def version(n: int, state: str) -> FloorVersion:
    return FloorVersion(
        version=n,
        state=state,
        revision=0,
        created_by="a",
        created_at=datetime.now(UTC),  # type: ignore[arg-type]
        published_by=None,
        published_at=None,
        note=None,
    )


def content(x: int) -> PlanContent:
    return PlanContent(
        objects=[
            PlacedObject(
                id=DESK,
                catalog_item_rev_id=DESK_REV,
                position=(x, 0, 0),
                rotation_ddeg=0,
                label="D1",
                attached_to=None,
                device_id=None,
                allocation_mode="assigned",
            )
        ]
    )


@pytest.fixture
def repo() -> InMemoryPlanRepository:
    r = InMemoryPlanRepository(TENANT)
    r.versions[FLOOR] = [version(1, "superseded"), version(2, "published"), version(3, "draft")]
    for n, x in ((1, 1000), (2, 2000), (3, 3000)):
        r.content[(FLOOR, n)] = content(x)
    return r


@pytest.fixture
def who() -> dict[str, Principal]:
    return {"p": ADMIN}


@pytest.fixture
def client(repo: InMemoryPlanRepository, who: dict[str, Principal]) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_plan_repository] = lambda: repo
    app.dependency_overrides[get_principal] = lambda: who["p"]
    with TestClient(app) as c:
        yield c


def test_admin_sees_all_versions_viewer_only_public(
    client: TestClient, who: dict[str, Principal]
) -> None:
    url = f"/api/v1/floors/{FLOOR}/versions"
    page = client.get(url).json()
    assert page["next_cursor"] is None
    assert [v["state"] for v in page["items"]] == ["superseded", "published", "draft"]
    who["p"] = VIEWER
    assert [v["version"] for v in client.get(url).json()["items"]] == [1, 2]


def test_plan_of_a_version(client: TestClient) -> None:
    plan = client.get(f"/api/v1/floors/{FLOOR}/versions/2").json()
    assert (plan["version"], plan["state"]) == (2, "published")
    assert plan["objects"][0]["position"] == [2000, 0, 0]


def test_viewer_gets_404_for_draft_version_and_403_for_draft(
    client: TestClient, who: dict[str, Principal]
) -> None:
    who["p"] = VIEWER
    assert client.get(f"/api/v1/floors/{FLOOR}/versions/3").status_code == 404  # not revealed
    assert client.get(f"/api/v1/floors/{FLOOR}/draft").status_code == 403


def test_admin_reads_draft(client: TestClient) -> None:
    draft = client.get(f"/api/v1/floors/{FLOOR}/draft").json()
    assert (draft["version"], draft["state"], draft["objects"][0]["position"]) == (
        3,
        "draft",
        [3000, 0, 0],
    )


def test_no_draft_is_404(client: TestClient, repo: InMemoryPlanRepository) -> None:
    repo.versions[FLOOR] = [version(1, "published")]
    r = client.get(f"/api/v1/floors/{FLOOR}/draft")
    assert r.status_code == 404
    assert r.json()["type"].endswith("/no-draft")


def test_diff_between_versions(client: TestClient, who: dict[str, Principal]) -> None:
    diff = client.get(f"/api/v1/floors/{FLOOR}/versions/1/diff/2").json()
    assert diff["objects"]["changed"] == [
        {"id": str(DESK), "before": {"position": [1000, 0, 0]}, "after": {"position": [2000, 0, 0]}}
    ]
    who["p"] = VIEWER
    assert (
        client.get(f"/api/v1/floors/{FLOOR}/versions/2/diff/3").status_code == 404
    )  # draft hidden


def test_unknown_floor_and_version(client: TestClient) -> None:
    assert client.get(f"/api/v1/floors/{new_id()}/versions").status_code == 404
    assert client.get(f"/api/v1/floors/{FLOOR}/versions/99").status_code == 404
    assert (
        client.get(f"/api/v1/floors/{FLOOR}/versions/0").status_code == 422
    )  # versions start at 1
