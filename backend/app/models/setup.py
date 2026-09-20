from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.types import created_at_column


class Setup(Base):
    __tablename__ = "setups"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    subtitle: Mapped[str | None] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()

    criteria: Mapped[list["SetupCriterion"]] = relationship(
        back_populates="setup",
        cascade="all, delete-orphan",
        order_by="SetupCriterion.display_order, SetupCriterion.id",
    )


class SetupCriterion(Base):
    __tablename__ = "setup_criteria"
    __table_args__ = (CheckConstraint("weight > 0", name="weight_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    setup_id: Mapped[int] = mapped_column(ForeignKey("setups.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(300))
    weight: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    display_order: Mapped[int] = mapped_column(default=0)

    setup: Mapped[Setup] = relationship(back_populates="criteria")
