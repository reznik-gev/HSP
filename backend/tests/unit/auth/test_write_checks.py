"""The checks on writes: only an admin may write, and only with the session's CSRF token
(docs/0038)."""

import pytest
from fastapi.testclient import TestClient

from hsp.auth.sessions import SessionTokens
from tests.stubs import STUB_CSRF_HEADER_NAME, STUB_CSRF_TOKEN
from tests.unit.auth.session_helpers import SignIn


async def test_admin_with_csrf_may_edit(
    sign_in: SignIn, probe_api: TestClient, admin_tokens: SessionTokens
) -> None:
    await sign_in(admin_tokens)
    r = probe_api.post("/_t/edit", headers={STUB_CSRF_HEADER_NAME: STUB_CSRF_TOKEN})
    assert r.status_code == 200


@pytest.mark.parametrize("headers", [{}, {STUB_CSRF_HEADER_NAME: "wrong"}])
async def test_missing_or_wrong_csrf_is_403(
    sign_in: SignIn, probe_api: TestClient, admin_tokens: SessionTokens, headers: dict[str, str]
) -> None:
    await sign_in(admin_tokens)
    r = probe_api.post("/_t/edit", headers=headers)
    assert r.status_code == 403
    assert r.json()["type"].endswith("/csrf-failed")


async def test_viewer_may_not_edit(
    sign_in: SignIn, probe_api: TestClient, viewer_tokens: SessionTokens
) -> None:
    await sign_in(viewer_tokens)
    r = probe_api.post("/_t/edit", headers={STUB_CSRF_HEADER_NAME: STUB_CSRF_TOKEN})
    assert r.status_code == 403
    assert r.json()["type"].endswith("/forbidden")
