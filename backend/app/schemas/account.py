from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.schemas.base import Money, Name, PatchSchema, PositivePrice

Currency = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=3, max_length=3)]
Symbol = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=32)]


class AccountCreate(BaseModel):
    name: Name
    label: str | None = None
    broker_name: str | None = None
    route: str | None = None
    starting_balance: Money
    currency: Currency = "USD"
    fee_profile_id: int | None = None
    minimum_threshold: Money | None = None


class AccountUpdate(PatchSchema):
    non_nullable = frozenset({"name", "starting_balance", "currency"})

    name: Name | None = None
    label: str | None = None
    broker_name: str | None = None
    route: str | None = None
    starting_balance: Money | None = None
    currency: Currency | None = None
    fee_profile_id: int | None = None
    minimum_threshold: Money | None = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    label: str | None
    broker_name: str | None
    route: str | None
    starting_balance: Decimal
    currency: str
    fee_profile_id: int | None
    minimum_threshold: Decimal | None
    archived_at: datetime | None
    created_at: datetime


class InstrumentCreate(BaseModel):
    symbol: Symbol
    name: str | None = None
    tick_size: PositivePrice
    tick_value: PositivePrice


class InstrumentUpdate(PatchSchema):
    non_nullable = frozenset({"symbol", "tick_size", "tick_value"})

    symbol: Symbol | None = None
    name: str | None = None
    tick_size: PositivePrice | None = None
    tick_value: PositivePrice | None = None


class InstrumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    symbol: str
    name: str | None
    tick_size: Decimal
    tick_value: Decimal
    archived_at: datetime | None
    created_at: datetime
