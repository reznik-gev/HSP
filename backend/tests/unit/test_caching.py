"""ETags on the polled reads: an unchanged answer is a 304 with no body (docs/0041, docs/0104)."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.unit.api_helpers import create_building, create_floor, create_site

pytestmark = pytest.mark.usefixtures("locations_repo")


@pytest.fixture
def floor_url(api: TestClient) -> str:
    site = create_site(api)
    floor: dict[str, Any] = create_floor(api, create_building(api, site["id"])["id"], 1)
    return f"/api/v1/floors/{floor['id']}"


def test_a_polled_read_has_a_weak_etag_and_must_revalidate(api: TestClient, floor_url: str) -> None:
    r = api.get(floor_url)
    assert r.status_code == 200
    assert r.headers["ETag"].startswith('W/"')
    assert r.headers["Cache-Control"] == "private, no-cache"
    assert api.get(floor_url).headers["ETag"] == r.headers["ETag"]  # same answer, same tag


def test_an_unchanged_answer_is_304_without_a_body(api: TestClient, floor_url: str) -> None:
    etag = api.get(floor_url).headers["ETag"]
    r = api.get(floor_url, headers={"If-None-Match": etag})
    assert r.status_code == 304
    assert r.content == b""
    assert r.headers["ETag"] == etag
    assert r.headers["Cache-Control"] == "private, no-cache"


def test_any_of_several_tags_matches(api: TestClient, floor_url: str) -> None:
    etag = api.get(floor_url).headers["ETag"]
    r = api.get(floor_url, headers={"If-None-Match": f'W/"other", {etag}'})
    assert r.status_code == 304


def test_a_changed_answer_is_sent_with_a_new_tag(api: TestClient, floor_url: str) -> None:
    etag = api.get(floor_url).headers["ETag"]
    assert api.patch(floor_url, json={"name": "Renamed"}).status_code == 200
    r = api.get(floor_url, headers={"If-None-Match": etag})
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"
    assert r.headers["ETag"] != etag


def test_errors_and_other_reads_have_no_etag(api: TestClient, floor_url: str) -> None:
    missing = api.get("/api/v1/floors/00000000-0000-7000-8000-000000000000")
    assert missing.status_code == 404
    assert "ETag" not in missing.headers
    assert "ETag" not in api.get("/api/v1/sites").headers
