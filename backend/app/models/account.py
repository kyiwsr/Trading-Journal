from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.types import MONEY, PRICE, created_at_column


class FeeProfile(Base):
    __tablename__ = "fee_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()

    components: Mapped[list["FeeComponent"]] = relationship(
        back_populates="fee_profile",
        cascade="all, delete-orphan",
        order_by="FeeComponent.id",
    )


class FeeComponent(Base):
    __tablename__ = "fee_components"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="amount_non_negative"),
        CheckConstraint("basis IN ('per_fill', 'per_contract')", name="basis_valid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    fee_profile_id: Mapped[int] = mapped_column(ForeignKey("fee_profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    amount: Mapped[Decimal] = mapped_column(MONEY)
    basis: Mapped[str] = mapped_column(String(16))

    fee_profile: Mapped[FeeProfile] = relationship(back_populates="components")


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (CheckConstraint("starting_balance >= 0", name="starting_balance_non_negative"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    label: Mapped[str | None] = mapped_column(String(120))
    broker_name: Mapped[str | None] = mapped_column(String(120))
    route: Mapped[str | None] = mapped_column(String(120))
    starting_balance: Mapped[Decimal] = mapped_column(MONEY)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    fee_profile_id: Mapped[int | None] = mapped_column(ForeignKey("fee_profiles.id", ondelete="SET NULL"))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()


class Instrument(Base):
    __tablename__ = "instruments"
    __table_args__ = (
        UniqueConstraint("user_id", "symbol"),
        CheckConstraint("tick_size > 0", name="tick_size_positive"),
        CheckConstraint("tick_value > 0", name="tick_value_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    symbol: Mapped[str] = mapped_column(String(32))
    name: Mapped[str | None] = mapped_column(String(120))
    tick_size: Mapped[Decimal] = mapped_column(PRICE)
    tick_value: Mapped[Decimal] = mapped_column(PRICE)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()
