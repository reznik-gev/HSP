"""Fixtures for the drafts and changesets tests (docs/0028, docs/0061 item 2, docs/0081).

Each test gets `admin_editing_new_floor` from tests/db/conftest.py: a new floor whose edit lock
the admin "alice" holds.
"""

from typing import Any

import pytest

from hsp.auth.principal import Principal
from tests.stubs import stub_admin


@pytest.fixture
def other_admin(admin_editing_new_floor: dict[str, Any]) -> Principal:
    """An admin who doesn't hold the floor's lock."""
    return stub_admin(admin_editing_new_floor["tenant"], "bob", "Bob")
