"""Fixtures for the drafts and changesets tests (docs/0028, docs/0061 item 2, docs/0081).

Each test gets `ctx` from tests/db/conftest.py: a new floor whose edit lock the admin "alice"
holds.
"""

from typing import Any

import pytest

from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.models import new_id


@pytest.fixture
def other_admin(ctx: dict[str, Any]) -> Principal:
    """An admin who doesn't hold the floor's lock."""
    return Principal("bob", "Bob", None, frozenset({ADMIN_ROLE}), ctx["tenant"], new_id(), "c")
