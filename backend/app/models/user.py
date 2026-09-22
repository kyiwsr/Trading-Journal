from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.types import created_at_column
from app.services.constants import DEFAULT_COMPLIANCE_CUTOFF


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("compliance_cutoff >= 0 AND compliance_cutoff <= 100", name="compliance_cutoff_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    compliance_cutoff: Mapped[int] = mapped_column(server_default=text(str(DEFAULT_COMPLIANCE_CUTOFF)))
    has_seen_tour: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    created_at: Mapped[datetime] = created_at_column()
