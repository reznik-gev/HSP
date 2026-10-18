"""Catalog and organization writes are admin + CSRF only (docs/0027, 0038, 0083, 0084)."""

import pytest
from fastapi.testclient import TestClient

from hsp.models import new_id
from tests.stubs import STUB_ADMIN, STUB_CSRF_HEADER, STUB_VIEWER
from tests.unit.api_helpers import SignedIn

ID = new_id()
WRITES = [
    ("post", "/api/v1/zone-types"),
    ("patch", f"/api/v1/zone-types/{ID}"),
    ("delete", f"/api/v1/zone-types/{ID}"),
    ("post", "/api/v1/catalog-items"),
    ("patch", f"/api/v1/catalog-items/{ID}"),
    ("delete", f"/api/v1/catalog-items/{ID}"),
    ("post", f"/api/v1/catalog-items/{ID}/restore"),
    ("post", "/api/v1/devices"),
    ("patch", f"/api/v1/devices/{ID}"),
    ("delete", f"/api/v1/devices/{ID}"),
    ("post", "/api/v1/org-units"),
    ("patch", f"/api/v1/org-units/{ID}"),
    ("delete", f"/api/v1/org-units/{ID}"),
    ("post", f"/api/v1/org-units/{ID}/restore"),
    ("post", f"/api/v1/org-units/{ID}/positions"),
    ("patch", f"/api/v1/positions/{ID}"),
    ("delete", f"/api/v1/positions/{ID}"),
    ("post", "/api/v1/people"),
    ("patch", f"/api/v1/people/{ID}"),
    ("delete", f"/api/v1/people/{ID}"),
    ("post", f"/api/v1/people/{ID}/reactivate"),
    ("put", f"/api/v1/people/{ID}/memberships"),
    ("post", "/api/v1/imports/units"),
    ("post", "/api/v1/imports/people"),
    ("put", f"/api/v1/seats/{ID}/assignment"),
    ("delete", f"/api/v1/seats/{ID}/assignment"),
    ("post", "/api/v1/seat-assignments/batch"),
    ("post", "/api/v1/imports/seat-assignments"),
]


@pytest.mark.parametrize(("method", "url"), WRITES)
def test_viewer_and_missing_csrf_are_refused(
    api: TestClient, signed_in: SignedIn, method: str, url: str
) -> None:
    signed_in.principal = STUB_VIEWER
    assert getattr(api, method)(url, headers=STUB_CSRF_HEADER).status_code == 403
    signed_in.principal = STUB_ADMIN
    assert getattr(api, method)(url).status_code == 403  # no CSRF header
