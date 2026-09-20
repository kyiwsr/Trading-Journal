"""user compliance cutoff

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("compliance_cutoff", sa.Integer(), server_default=sa.text("80"), nullable=False))
    op.create_check_constraint(
        op.f("ck_users_compliance_cutoff_range"), "users", "compliance_cutoff >= 0 AND compliance_cutoff <= 100"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_users_compliance_cutoff_range"), "users", type_="check")
    op.drop_column("users", "compliance_cutoff")
