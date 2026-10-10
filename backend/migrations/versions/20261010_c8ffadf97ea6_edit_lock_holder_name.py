"""edit lock holder name (docs/0016: show who is editing)

Revision ID: c8ffadf97ea6
Revises: 5e1f0a7c2d41
Create Date: 2026-10-10 13:18:48.068067

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8ffadf97ea6"
down_revision: str | Sequence[str] | None = "5e1f0a7c2d41"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("floor_edit_lock", sa.Column("holder_name", sa.String(length=200), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("floor_edit_lock", "holder_name")
