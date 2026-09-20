from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Sequence

from app.services.rounding import round_half_up, to_cents

Direction = Literal["long", "short"]
FillType = Literal["entry", "exit"]


@dataclass(frozen=True)
class Fill:
    fill_type: FillType
    price: Decimal
    quantity: Decimal

    def __post_init__(self) -> None:
        if self.quantity <= 0:
            raise ValueError(f"fill quantity must be positive, got {self.quantity}")


@dataclass(frozen=True)
class Instrument:
    tick_size: Decimal
    tick_value: Decimal


@dataclass(frozen=True)
class ExitRealized:
    points: Decimal
    pnl: Decimal


@dataclass(frozen=True)
class TradeResult:
    quantity: Decimal
    avg_entry: Decimal
    avg_exit: Decimal
    points: Decimal
    gross_pnl: Decimal
    risk_amount: Decimal | None
    net_pnl: Decimal
    r_multiple: Decimal | None


def _direction_sign(direction: str) -> int:
    if direction == "long":
        return 1
    if direction == "short":
        return -1
    raise ValueError(f"unknown direction: {direction!r}")


def _quantity(fills: Sequence[Fill], fill_type: FillType) -> Decimal:
    return sum((f.quantity for f in fills if f.fill_type == fill_type), Decimal(0))


def average_price(fills: Sequence[Fill], fill_type: FillType) -> Decimal:
    matching = [f for f in fills if f.fill_type == fill_type]
    if not matching:
        raise ValueError(f"no {fill_type} fills")
    total_quantity = sum((f.quantity for f in matching), Decimal(0))
    return sum((f.price * f.quantity for f in matching), Decimal(0)) / total_quantity


def _money(points: Decimal, instrument: Instrument, quantity: Decimal) -> Decimal:
    return points / instrument.tick_size * instrument.tick_value * quantity


def exit_realized(
    direction: Direction, avg_entry: Decimal, exit_fill: Fill, instrument: Instrument
) -> ExitRealized:
    points = _direction_sign(direction) * (exit_fill.price - avg_entry)
    return ExitRealized(points, to_cents(_money(points, instrument, exit_fill.quantity)))


def slippage_cost(ticks: Decimal, instrument: Instrument, quantity: Decimal) -> Decimal:
    return to_cents(ticks * instrument.tick_value * quantity)


def compute_trade(
    direction: Direction,
    fills: Sequence[Fill],
    instrument: Instrument,
    stop_price: Decimal | None = None,
    fees_total: Decimal = Decimal(0),
    slippage_ticks: Decimal = Decimal(0),
) -> TradeResult:
    sign = _direction_sign(direction)
    avg_entry = average_price(fills, "entry")
    avg_exit = average_price(fills, "exit")
    quantity = _quantity(fills, "entry")
    if quantity != _quantity(fills, "exit"):
        raise ValueError("entry and exit quantities differ")

    points = sign * (avg_exit - avg_entry)
    gross_pnl = to_cents(_money(points, instrument, quantity))
    net_pnl = to_cents(
        gross_pnl - fees_total - slippage_cost(slippage_ticks, instrument, quantity)
    )

    risk_amount = None
    r_multiple = None
    if stop_price is not None:
        risk_points = abs(avg_entry - stop_price)
        risk_amount = to_cents(_money(risk_points, instrument, quantity))
        if risk_amount > 0:
            r_multiple = round_half_up(net_pnl / risk_amount, 2)

    return TradeResult(
        quantity=quantity,
        avg_entry=avg_entry,
        avg_exit=avg_exit,
        points=points,
        gross_pnl=gross_pnl,
        risk_amount=risk_amount,
        net_pnl=net_pnl,
        r_multiple=r_multiple,
    )
