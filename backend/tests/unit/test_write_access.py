"""Catalog and organization writes are admin + CSRF only (docs/0027, 0038, 0083, 0084)."""

import pytest
from fastapi.testclient import TestClient

from hsp.auth.dependencies import get_principal
from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.main import create_app
from hsp.models import new_id

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
]


@pytest.mark.parametrize(("method", "url"), WRITES)
def test_viewer_and_missing_csrf_are_refused(method: str, url: str) -> None:
    app = create_app()
    tenant = new_id()
    with TestClient(app) as client:
        app.dependency_overrides[get_principal] = lambda: Principal(
            "v", "V", None, frozenset(), tenant, new_id(), "c"
        )
        assert getattr(client, method)(url, headers={"X-CSRF-Token": "c"}).status_code == 403
        app.dependency_overrides[get_principal] = lambda: Principal(
            "a", "A", None, frozenset({ADMIN_ROLE}), tenant, new_id(), "c"
        )
        assert getattr(client, method)(url).status_code == 403  # no CSRF header
