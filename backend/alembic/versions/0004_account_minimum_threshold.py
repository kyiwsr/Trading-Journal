"""account minimum threshold

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("minimum_threshold", sa.Numeric(18, 4), nullable=True))
    op.create_check_constraint(
        "minimum_threshold_non_negative", "accounts", "minimum_threshold IS NULL OR minimum_threshold >= 0"
    )


def downgrade() -> None:
    op.drop_constraint("minimum_threshold_non_negative", "accounts", type_="check")
    op.drop_column("accounts", "minimum_threshold")
