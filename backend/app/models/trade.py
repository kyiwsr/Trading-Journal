from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.types import MONEY, PRICE, TEXT_LIST, created_at_column


class Trade(Base):
    __tablename__ = "trades"
    __table_args__ = (
        CheckConstraint("direction IN ('long', 'short')", name="direction_valid"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("closed_at >= opened_at", name="closed_after_opened"),
        CheckConstraint(
            "execution_score IS NULL OR (execution_score >= 0 AND execution_score <= 100)",
            name="execution_score_range",
        ),
        Index("ix_trades_account_id_closed_at", "account_id", "closed_at"),
        Index("ix_trades_setup_id", "setup_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id", ondelete="RESTRICT"))
    setup_id: Mapped[int | None] = mapped_column(ForeignKey("setups.id", ondelete="RESTRICT"))
    direction: Mapped[str] = mapped_column(String(5))
    session: Mapped[str | None] = mapped_column(String(60))
    tags: Mapped[list[str]] = mapped_column(TEXT_LIST, default=list)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    stop_price: Mapped[Decimal | None] = mapped_column(PRICE)
    target_price: Mapped[Decimal | None] = mapped_column(PRICE)

    quantity: Mapped[Decimal] = mapped_column(PRICE)
    avg_entry: Mapped[Decimal] = mapped_column(PRICE)
    avg_exit: Mapped[Decimal] = mapped_column(PRICE)
    risk_amount: Mapped[Decimal | None] = mapped_column(MONEY)
    gross_pnl: Mapped[Decimal] = mapped_column(MONEY)
    fees_total: Mapped[Decimal] = mapped_column(MONEY)
    net_pnl: Mapped[Decimal] = mapped_column(MONEY)
    r_multiple: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    execution_score: Mapped[int | None] = mapped_column(Integer)

    pre_trade_focus: Mapped[str | None] = mapped_column(Text)
    environment: Mapped[str | None] = mapped_column(Text)
    debrief_notes: Mapped[str | None] = mapped_column(Text)
    screenshot_path: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = created_at_column()

    fills: Mapped[list["TradeFill"]] = relationship(
        back_populates="trade", cascade="all, delete-orphan", order_by="TradeFill.filled_at, TradeFill.id"
    )
    fees: Mapped[list["TradeFee"]] = relationship(
        back_populates="trade", cascade="all, delete-orphan", order_by="TradeFee.id"
    )
    criteria_checks: Mapped[list["TradeCriterionCheck"]] = relationship(
        back_populates="trade", cascade="all, delete-orphan", order_by="TradeCriterionCheck.id"
    )


class TradeFill(Base):
    __tablename__ = "trade_fills"
    __table_args__ = (
        CheckConstraint("fill_type IN ('entry', 'exit')", name="fill_type_valid"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    trade_id: Mapped[int] = mapped_column(ForeignKey("trades.id", ondelete="CASCADE"), index=True)
    fill_type: Mapped[str] = mapped_column(String(5))
    price: Mapped[Decimal] = mapped_column(PRICE)
    quantity: Mapped[Decimal] = mapped_column(PRICE)
    filled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(300))

    trade: Mapped[Trade] = relationship(back_populates="fills")


class TradeFee(Base):
    __tablename__ = "trade_fees"

    id: Mapped[int] = mapped_column(primary_key=True)
    trade_id: Mapped[int] = mapped_column(ForeignKey("trades.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    amount: Mapped[Decimal] = mapped_column(MONEY)

    trade: Mapped[Trade] = relationship(back_populates="fees")


class TradeCriterionCheck(Base):
    __tablename__ = "trade_criteria_checks"
    __table_args__ = (UniqueConstraint("trade_id", "criterion_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    trade_id: Mapped[int] = mapped_column(ForeignKey("trades.id", ondelete="CASCADE"))
    criterion_id: Mapped[int] = mapped_column(ForeignKey("setup_criteria.id", ondelete="RESTRICT"), index=True)
    checked: Mapped[bool] = mapped_column(Boolean)
    note: Mapped[str | None] = mapped_column(Text)

    trade: Mapped[Trade] = relationship(back_populates="criteria_checks")


class XpEvent(Base):
    __tablename__ = "xp_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    trade_id: Mapped[int] = mapped_column(ForeignKey("trades.id", ondelete="CASCADE"), index=True)
    points: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = created_at_column()
