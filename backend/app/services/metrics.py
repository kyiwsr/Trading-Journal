from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Sequence

from app.services.constants import LOW_SAMPLE_BELOW_TRADES, SETUP_ELITE_MIN_AVG_SCORE
from app.services.rounding import round_half_up
from app.services.scoring import Band, is_compliant, score_band

ZERO = Decimal(0)


@dataclass(frozen=True)
class TradeRow:
    closed_at: datetime
    gross_pnl: Decimal
    fees_total: Decimal
    net_pnl: Decimal
    r_multiple: Decimal | None = None
    execution_score: int | None = None
    setup_id: int | None = None
    setup_name: str | None = None
    opened_at: datetime | None = None


@dataclass(frozen=True)
class Summary:
    trade_count: int
    wins: int
    losses: int
    breakevens: int
    net_pnl: Decimal
    gross_pnl: Decimal
    fees_total: Decimal
    gross_profits: Decimal
    gross_losses: Decimal
    profit_factor: Decimal | None
    win_rate: Decimal | None
    expectancy: Decimal | None
    total_r: Decimal
    avg_execution_score: Decimal | None
    return_pct: Decimal | None


@dataclass(frozen=True)
class LedgerSummary:
    trade_count: int
    wins: int
    losses: int
    breakevens: int
    net_pnl: Decimal
    fees_total: Decimal
    win_rate: Decimal | None
    profit_factor: Decimal | None
    avg_execution_score: Decimal | None
    scored_count: int
    compliant_count: int
    elite_count: int
    avg_hold_seconds: int | None


@dataclass(frozen=True)
class EquityPoint:
    closed_at: datetime
    equity: Decimal


@dataclass(frozen=True)
class EquityCurve:
    points: list[EquityPoint]
    peak: Decimal
    current: Decimal
    drawdown_amount: Decimal
    drawdown_pct: Decimal
    max_drawdown_pct: Decimal


@dataclass(frozen=True)
class DisciplineBucket:
    band: Band
    trade_count: int
    win_rate: Decimal | None
    net_pnl: Decimal
    avg_r: Decimal | None


@dataclass(frozen=True)
class DisciplineReport:
    buckets: list[DisciplineBucket]
    saved_capital: Decimal


class SetupRank(str, Enum):
    ELITE = "elite"
    SOLID = "solid"
    NEGATIVE_EDGE = "negative_edge"


@dataclass(frozen=True)
class SetupRow:
    setup_id: int
    name: str | None
    trade_count: int
    win_rate: Decimal | None
    net_pnl: Decimal
    expectancy: Decimal | None
    avg_execution_score: Decimal | None
    rank: SetupRank
    low_sample: bool


def _mean(values: Sequence[Decimal]) -> Decimal | None:
    return sum(values, ZERO) / len(values) if values else None


def _round_or_none(value: Decimal | None, places: int) -> Decimal | None:
    return None if value is None else round_half_up(value, places)


def _mean_r(trades: Sequence[TradeRow]) -> Decimal | None:
    return _mean([t.r_multiple for t in trades if t.r_multiple is not None])


def _mean_score(trades: Sequence[TradeRow]) -> Decimal | None:
    return _mean([Decimal(t.execution_score) for t in trades if t.execution_score is not None])


def _win_rate(trades: Sequence[TradeRow]) -> Decimal | None:
    if not trades:
        return None
    wins = sum(1 for t in trades if t.net_pnl > 0)
    return round_half_up(Decimal(wins) / len(trades) * 100, 1)


def _drawdown_pct(peak: Decimal, equity: Decimal) -> Decimal:
    return (peak - equity) / peak * 100 if peak > 0 else ZERO


def summarize(trades: Sequence[TradeRow], starting_balance: Decimal) -> Summary:
    net_pnl = sum((t.net_pnl for t in trades), ZERO)
    gross_profits = sum((t.net_pnl for t in trades if t.net_pnl > 0), ZERO)
    gross_losses = -sum((t.net_pnl for t in trades if t.net_pnl < 0), ZERO)
    # Profit factor is undefined without a losing trade, so it is None rather than infinite.
    profit_factor = (
        round_half_up(gross_profits / gross_losses, 2) if gross_losses > 0 else None
    )
    total_r = sum((t.r_multiple for t in trades if t.r_multiple is not None), ZERO)
    return Summary(
        trade_count=len(trades),
        wins=sum(1 for t in trades if t.net_pnl > 0),
        losses=sum(1 for t in trades if t.net_pnl < 0),
        breakevens=sum(1 for t in trades if t.net_pnl == 0),
        net_pnl=net_pnl,
        gross_pnl=sum((t.gross_pnl for t in trades), ZERO),
        fees_total=sum((t.fees_total for t in trades), ZERO),
        gross_profits=gross_profits,
        gross_losses=gross_losses,
        profit_factor=profit_factor,
        win_rate=_win_rate(trades),
        expectancy=_round_or_none(_mean_r(trades), 2),
        total_r=round_half_up(total_r, 2),
        avg_execution_score=_round_or_none(_mean_score(trades), 1),
        return_pct=(
            round_half_up(net_pnl / starting_balance * 100, 2)
            if starting_balance > 0
            else None
        ),
    )


def ledger_summary(trades: Sequence[TradeRow], compliance_cutoff: int) -> LedgerSummary:
    base = summarize(trades, ZERO)
    scores = [t.execution_score for t in trades if t.execution_score is not None]
    holds = [Decimal((t.closed_at - t.opened_at).total_seconds()) for t in trades if t.opened_at is not None]
    avg_hold = _mean(holds)
    return LedgerSummary(
        trade_count=base.trade_count,
        wins=base.wins,
        losses=base.losses,
        breakevens=base.breakevens,
        net_pnl=base.net_pnl,
        fees_total=base.fees_total,
        win_rate=base.win_rate,
        profit_factor=base.profit_factor,
        avg_execution_score=base.avg_execution_score,
        scored_count=len(scores),
        compliant_count=sum(1 for score in scores if is_compliant(score, compliance_cutoff)),
        elite_count=sum(1 for score in scores if score_band(score) is Band.ELITE),
        avg_hold_seconds=None if avg_hold is None else int(round_half_up(avg_hold, 0)),
    )


def equity_curve(trades: Sequence[TradeRow], starting_balance: Decimal) -> EquityCurve:
    equity = peak = starting_balance
    max_drawdown_pct = ZERO
    points = []
    for t in sorted(trades, key=lambda t: t.closed_at):
        equity += t.net_pnl
        peak = max(peak, equity)
        max_drawdown_pct = max(max_drawdown_pct, _drawdown_pct(peak, equity))
        points.append(EquityPoint(t.closed_at, equity))
    return EquityCurve(
        points=points,
        peak=peak,
        current=equity,
        drawdown_amount=peak - equity,
        drawdown_pct=round_half_up(_drawdown_pct(peak, equity), 2),
        max_drawdown_pct=round_half_up(max_drawdown_pct, 2),
    )


def discipline_report(trades: Sequence[TradeRow]) -> DisciplineReport:
    buckets = []
    for band in Band:
        in_band = [t for t in trades if score_band(t.execution_score) is band]
        buckets.append(
            DisciplineBucket(
                band=band,
                trade_count=len(in_band),
                win_rate=_win_rate(in_band),
                net_pnl=sum((t.net_pnl for t in in_band), ZERO),
                avg_r=_round_or_none(_mean_r(in_band), 2),
            )
        )
    breach_pnl = next(b.net_pnl for b in buckets if b.band is Band.RULE_BREACH)
    return DisciplineReport(buckets, saved_capital=-breach_pnl if breach_pnl < 0 else ZERO)


def _setup_row(setup_id: int, trades: Sequence[TradeRow]) -> SetupRow:
    # Rank compares unrounded values so a display of 0.00 cannot hide a negative edge.
    expectancy = _mean_r(trades)
    avg_score = _mean_score(trades)
    if expectancy is not None and expectancy < 0:
        rank = SetupRank.NEGATIVE_EDGE
    elif avg_score is not None and avg_score >= SETUP_ELITE_MIN_AVG_SCORE:
        rank = SetupRank.ELITE
    else:
        rank = SetupRank.SOLID
    return SetupRow(
        setup_id=setup_id,
        name=next((t.setup_name for t in trades if t.setup_name), None),
        trade_count=len(trades),
        win_rate=_win_rate(trades),
        net_pnl=sum((t.net_pnl for t in trades), ZERO),
        expectancy=_round_or_none(expectancy, 2),
        avg_execution_score=_round_or_none(avg_score, 1),
        rank=rank,
        low_sample=len(trades) < LOW_SAMPLE_BELOW_TRADES,
    )


def setup_table(trades: Sequence[TradeRow]) -> list[SetupRow]:
    by_setup: dict[int, list[TradeRow]] = {}
    for t in trades:
        if t.setup_id is not None:
            by_setup.setdefault(t.setup_id, []).append(t)
    rows = [_setup_row(setup_id, ts) for setup_id, ts in by_setup.items()]
    rows.sort(key=lambda r: (-r.trade_count, (r.name or "").casefold()))
    return rows
