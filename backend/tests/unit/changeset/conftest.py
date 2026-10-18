"""Fixtures for the changeset engine tests: the plan a test starts from and what exists outside
it (docs/0081)."""

import pytest

from hsp.plans.changeset import References
from hsp.plans.schema import PlanContent
from tests.unit.changeset.stubs import REFS


@pytest.fixture
def empty_plan() -> PlanContent:
    return PlanContent()


@pytest.fixture
def refs() -> References:
    """The catalog (a desk, a chair, a monitor), one zone type and one device."""
    return REFS
