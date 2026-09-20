"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PRICE = sa.Numeric(20, 8)
MONEY = sa.Numeric(18, 4)


def _created_at() -> sa.Column:
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        _created_at(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )

    op.create_table(
        "fee_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_fee_profiles_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fee_profiles")),
    )
    op.create_index(op.f("ix_fee_profiles_user_id"), "fee_profiles", ["user_id"])

    op.create_table(
        "fee_components",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("fee_profile_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("basis", sa.String(16), nullable=False),
        sa.CheckConstraint("amount >= 0", name=op.f("ck_fee_components_amount_non_negative")),
        sa.CheckConstraint("basis IN ('per_fill', 'per_contract')", name=op.f("ck_fee_components_basis_valid")),
        sa.ForeignKeyConstraint(
            ["fee_profile_id"], ["fee_profiles.id"], name=op.f("fk_fee_components_fee_profile_id_fee_profiles"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fee_components")),
    )
    op.create_index(op.f("ix_fee_components_fee_profile_id"), "fee_components", ["fee_profile_id"])

    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("label", sa.String(120), nullable=True),
        sa.Column("broker_name", sa.String(120), nullable=True),
        sa.Column("route", sa.String(120), nullable=True),
        sa.Column("starting_balance", MONEY, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("fee_profile_id", sa.Integer(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        sa.CheckConstraint("starting_balance >= 0", name=op.f("ck_accounts_starting_balance_non_negative")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_accounts_user_id_users"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["fee_profile_id"], ["fee_profiles.id"], name=op.f("fk_accounts_fee_profile_id_fee_profiles"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_accounts")),
    )
    op.create_index(op.f("ix_accounts_user_id"), "accounts", ["user_id"])

    op.create_table(
        "instruments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("symbol", sa.String(32), nullable=False),
        sa.Column("name", sa.String(120), nullable=True),
        sa.Column("tick_size", PRICE, nullable=False),
        sa.Column("tick_value", PRICE, nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        sa.CheckConstraint("tick_size > 0", name=op.f("ck_instruments_tick_size_positive")),
        sa.CheckConstraint("tick_value > 0", name=op.f("ck_instruments_tick_value_positive")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_instruments_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_instruments")),
        sa.UniqueConstraint("user_id", "symbol", name=op.f("uq_instruments_user_id_symbol")),
    )

    op.create_table(
        "setups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("subtitle", sa.String(160), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_setups_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_setups")),
    )
    op.create_index(op.f("ix_setups_user_id"), "setups", ["user_id"])

    op.create_table(
        "setup_criteria",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("setup_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(300), nullable=False),
        sa.Column("weight", sa.Numeric(10, 2), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.CheckConstraint("weight > 0", name=op.f("ck_setup_criteria_weight_positive")),
        sa.ForeignKeyConstraint(["setup_id"], ["setups.id"], name=op.f("fk_setup_criteria_setup_id_setups"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_setup_criteria")),
    )
    op.create_index(op.f("ix_setup_criteria_setup_id"), "setup_criteria", ["setup_id"])

    op.create_table(
        "trades",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("instrument_id", sa.Integer(), nullable=False),
        sa.Column("setup_id", sa.Integer(), nullable=True),
        sa.Column("direction", sa.String(5), nullable=False),
        sa.Column("session", sa.String(60), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stop_price", PRICE, nullable=True),
        sa.Column("target_price", PRICE, nullable=True),
        sa.Column("quantity", PRICE, nullable=False),
        sa.Column("avg_entry", PRICE, nullable=False),
        sa.Column("avg_exit", PRICE, nullable=False),
        sa.Column("risk_amount", MONEY, nullable=True),
        sa.Column("gross_pnl", MONEY, nullable=False),
        sa.Column("fees_total", MONEY, nullable=False),
        sa.Column("slippage_ticks", PRICE, nullable=False),
        sa.Column("net_pnl", MONEY, nullable=False),
        sa.Column("r_multiple", sa.Numeric(10, 4), nullable=True),
        sa.Column("execution_score", sa.Integer(), nullable=True),
        sa.Column("pre_trade_focus", sa.Text(), nullable=True),
        sa.Column("environment", sa.Text(), nullable=True),
        sa.Column("debrief_notes", sa.Text(), nullable=True),
        sa.Column("screenshot_path", sa.String(500), nullable=True),
        _created_at(),
        sa.CheckConstraint("direction IN ('long', 'short')", name=op.f("ck_trades_direction_valid")),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_trades_quantity_positive")),
        sa.CheckConstraint("closed_at >= opened_at", name=op.f("ck_trades_closed_after_opened")),
        sa.CheckConstraint(
            "execution_score IS NULL OR (execution_score >= 0 AND execution_score <= 100)",
            name=op.f("ck_trades_execution_score_range"),
        ),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], name=op.f("fk_trades_account_id_accounts"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["instrument_id"], ["instruments.id"], name=op.f("fk_trades_instrument_id_instruments"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["setup_id"], ["setups.id"], name=op.f("fk_trades_setup_id_setups"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trades")),
    )
    op.create_index("ix_trades_account_id_closed_at", "trades", ["account_id", "closed_at"])
    op.create_index("ix_trades_setup_id", "trades", ["setup_id"])

    op.create_table(
        "trade_fills",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("trade_id", sa.Integer(), nullable=False),
        sa.Column("fill_type", sa.String(5), nullable=False),
        sa.Column("price", PRICE, nullable=False),
        sa.Column("quantity", PRICE, nullable=False),
        sa.Column("filled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.String(300), nullable=True),
        sa.CheckConstraint("fill_type IN ('entry', 'exit')", name=op.f("ck_trade_fills_fill_type_valid")),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_trade_fills_quantity_positive")),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.id"], name=op.f("fk_trade_fills_trade_id_trades"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trade_fills")),
    )
    op.create_index(op.f("ix_trade_fills_trade_id"), "trade_fills", ["trade_id"])

    op.create_table(
        "trade_fees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("trade_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.id"], name=op.f("fk_trade_fees_trade_id_trades"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trade_fees")),
    )
    op.create_index(op.f("ix_trade_fees_trade_id"), "trade_fees", ["trade_id"])

    op.create_table(
        "trade_criteria_checks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("trade_id", sa.Integer(), nullable=False),
        sa.Column("criterion_id", sa.Integer(), nullable=False),
        sa.Column("checked", sa.Boolean(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["trade_id"], ["trades.id"], name=op.f("fk_trade_criteria_checks_trade_id_trades"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["criterion_id"],
            ["setup_criteria.id"],
            name=op.f("fk_trade_criteria_checks_criterion_id_setup_criteria"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trade_criteria_checks")),
        sa.UniqueConstraint("trade_id", "criterion_id", name=op.f("uq_trade_criteria_checks_trade_id_criterion_id")),
    )
    op.create_index(op.f("ix_trade_criteria_checks_criterion_id"), "trade_criteria_checks", ["criterion_id"])

    op.create_table(
        "xp_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("trade_id", sa.Integer(), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        _created_at(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_xp_events_user_id_users"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.id"], name=op.f("fk_xp_events_trade_id_trades"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_xp_events")),
    )
    op.create_index(op.f("ix_xp_events_user_id"), "xp_events", ["user_id"])
    op.create_index(op.f("ix_xp_events_trade_id"), "xp_events", ["trade_id"])


def downgrade() -> None:
    for table in (
        "xp_events",
        "trade_criteria_checks",
        "trade_fees",
        "trade_fills",
        "trades",
        "setup_criteria",
        "setups",
        "instruments",
        "accounts",
        "fee_components",
        "fee_profiles",
        "users",
    ):
        op.drop_table(table)
