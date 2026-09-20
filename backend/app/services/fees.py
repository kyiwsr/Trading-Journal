from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Sequence

from app.services.rounding import to_cents
from app.services.trade_math import Fill

FeeBasis = Literal["per_fill", "per_contract"]


@dataclass(frozen=True)
class FeeComponent:
    name: str
    amount: Decimal
    basis: FeeBasis


@dataclass(frozen=True)
class FeeLine:
    name: str
    amount: Decimal


def _units(basis: str, fills: Sequence[Fill]) -> Decimal:
    if basis == "per_fill":
        return Decimal(len(fills))
    if basis == "per_contract":
        return sum((f.quantity for f in fills), Decimal(0))
    raise ValueError(f"unknown fee basis: {basis!r}")


def apply_fees(components: Sequence[FeeComponent], fills: Sequence[Fill]) -> list[FeeLine]:
    return [
        FeeLine(c.name, to_cents(c.amount * _units(c.basis, fills))) for c in components
    ]


def total_fees(lines: Sequence[FeeLine]) -> Decimal:
    return sum((line.amount for line in lines), Decimal(0))
