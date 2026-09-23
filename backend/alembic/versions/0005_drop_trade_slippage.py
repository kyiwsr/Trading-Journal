"""drop trade slippage

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("trades", "slippage_ticks")


def downgrade() -> None:
    op.add_column("trades", sa.Column("slippage_ticks", sa.Numeric(20, 8), nullable=False, server_default="0"))
