"""Shared setup for the API unit tests: who is signed in, and locations made through the API.

The `api`, `signed_in` and `locations_repo` fixtures in tests/unit/conftest.py use these.
"""

from dataclasses import dataclass
from typing import Any

from fastapi.testclient import TestClient

from hsp.auth.principal import Principal


@dataclass
class SignedIn:
    """Who the `api` client's requests run as. A test switches user by setting `principal`."""

    principal: Principal


def create_site(api: TestClient, name: str = "HQ", time_zone: str = "UTC") -> dict[str, Any]:
    r = api.post("/api/v1/sites", json={"name": name, "time_zone": time_zone})
    assert r.status_code == 201, r.text
    body: dict[str, Any] = r.json()
    return body


def create_building(
    api: TestClient, site_id: str, code: str = "A", expect: int = 201
) -> dict[str, Any]:
    r = api.post(
        "/api/v1/buildings",
        json={"site_id": site_id, "name": f"Building {code}", "code": code},
    )
    assert r.status_code == expect, r.text
    body: dict[str, Any] = r.json()
    return body


def create_floor(
    api: TestClient, building_id: str, level: int, expect: int = 201, **extra: Any
) -> dict[str, Any]:
    r = api.post(
        "/api/v1/floors",
        json={"building_id": building_id, "name": f"L{level}", "level_index": level, **extra},
    )
    assert r.status_code == expect, r.text
    body: dict[str, Any] = r.json()
    return body
