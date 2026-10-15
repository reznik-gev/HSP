"""Fixtures for the drafts and changesets tests (docs/0028, docs/0061 item 2, docs/0081).

Each test gets a new floor in the default tenant whose edit lock the admin "alice" holds, with
the stock desk and a zone type to place (see tests/db/plan_helpers.py).
"""

from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.models import new_id
from tests.db.plan_helpers import context


@pytest.fixture
def db(conn: AsyncConnection) -> AsyncSession:
    return AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)


@pytest.fixture
async def ctx(db: AsyncSession) -> dict[str, Any]:
    return await context(db)


@pytest.fixture
def other_admin(ctx: dict[str, Any]) -> Principal:
    """An admin who doesn't hold the floor's lock."""
    return Principal("bob", "Bob", None, frozenset({ADMIN_ROLE}), ctx["tenant"], new_id(), "c")
