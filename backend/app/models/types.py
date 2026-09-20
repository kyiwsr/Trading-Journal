from datetime import datetime

from sqlalchemy import JSON, DateTime, Numeric, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

PRICE = Numeric(20, 8)
MONEY = Numeric(18, 4)

# JSON on SQLite lets the API tests run without a Postgres server; production is always ARRAY.
TEXT_LIST = ARRAY(Text).with_variant(JSON(), "sqlite")


def created_at_column() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())
