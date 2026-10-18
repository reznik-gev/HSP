"""Floor-plan read endpoints with an in-memory repository: visibility rules of docs/0080."""

from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hsp.api.plans import get_plan_repository
from hsp.auth.principal import Principal
from hsp.models import new_id
from hsp.plans.schema import FloorVersion, PlanContent
from tests.fakes import InMemoryPlanRepository
from tests.stubs import STUB_TENANT, stub_placed_object
from tests.unit.api_helpers import SignedIn

FLOOR = new_id()
DESK = new_id()
DESK_REV = new_id()  # same catalog revision in every version

pytestmark = pytest.mark.usefixtures("plan_repo")


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
    """The plan with its one desk, DESK, at (x, 0)."""
    return PlanContent(objects=[stub_placed_object(DESK_REV, id=DESK, position=(x, 0, 0))])


@pytest.fixture
def plan_repo(app: FastAPI) -> InMemoryPlanRepository:
    """FLOOR with versions 1 (superseded), 2 (published) and 3 (the draft), its desk at x = 1000,
    2000 and 3000 mm; plugged into the app."""
    repo = InMemoryPlanRepository(STUB_TENANT)
    repo.versions[FLOOR] = [
        version(1, "superseded"),
        version(2, "published"),
        version(3, "draft"),
    ]
    for n, x in ((1, 1000), (2, 2000), (3, 3000)):
        repo.content[(FLOOR, n)] = content(x)
    app.dependency_overrides[get_plan_repository] = lambda: repo
    return repo


def test_admin_sees_all_versions_viewer_only_public(
    api: TestClient, signed_in: SignedIn, viewer: Principal
) -> None:
    url = f"/api/v1/floors/{FLOOR}/versions"
    page = api.get(url).json()
    assert page["next_cursor"] is None
    assert [v["state"] for v in page["items"]] == ["superseded", "published", "draft"]
    signed_in.principal = viewer
    assert [v["version"] for v in api.get(url).json()["items"]] == [1, 2]


def test_plan_of_a_version(api: TestClient) -> None:
    plan = api.get(f"/api/v1/floors/{FLOOR}/versions/2").json()
    assert (plan["version"], plan["state"]) == (2, "published")
    assert plan["objects"][0]["position"] == [2000, 0, 0]


def test_viewer_gets_404_for_draft_version_and_403_for_draft(
    api: TestClient, signed_in: SignedIn, viewer: Principal
) -> None:
    signed_in.principal = viewer
    assert api.get(f"/api/v1/floors/{FLOOR}/versions/3").status_code == 404  # not revealed
    assert api.get(f"/api/v1/floors/{FLOOR}/draft").status_code == 403


def test_admin_reads_draft(api: TestClient) -> None:
    draft = api.get(f"/api/v1/floors/{FLOOR}/draft").json()
    assert (draft["version"], draft["state"], draft["objects"][0]["position"]) == (
        3,
        "draft",
        [3000, 0, 0],
    )


def test_no_draft_is_404(api: TestClient, plan_repo: InMemoryPlanRepository) -> None:
    plan_repo.versions[FLOOR] = [version(1, "published")]
    r = api.get(f"/api/v1/floors/{FLOOR}/draft")
    assert r.status_code == 404
    assert r.json()["type"].endswith("/no-draft")


def test_diff_between_versions(api: TestClient, signed_in: SignedIn, viewer: Principal) -> None:
    diff = api.get(f"/api/v1/floors/{FLOOR}/versions/1/diff/2").json()
    assert diff["objects"]["changed"] == [
        {"id": str(DESK), "before": {"position": [1000, 0, 0]}, "after": {"position": [2000, 0, 0]}}
    ]
    signed_in.principal = viewer
    assert api.get(f"/api/v1/floors/{FLOOR}/versions/2/diff/3").status_code == 404  # draft hidden


def test_unknown_floor_and_version(api: TestClient) -> None:
    assert api.get(f"/api/v1/floors/{new_id()}/versions").status_code == 404
    assert api.get(f"/api/v1/floors/{FLOOR}/versions/99").status_code == 404
    assert api.get(f"/api/v1/floors/{FLOOR}/versions/0").status_code == 422  # versions start at 1
