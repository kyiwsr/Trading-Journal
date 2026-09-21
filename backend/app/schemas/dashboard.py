from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.trade import TradeListItem


class SummaryOut(BaseModel):
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


class EquityPointOut(BaseModel):
    closed_at: datetime
    equity: Decimal
    trade_id: int
    net_pnl: Decimal
    result: Literal["win", "loss", "breakeven"]


class EquityOut(BaseModel):
    baseline: Decimal
    points: list[EquityPointOut]
    peak: Decimal
    current: Decimal
    drawdown_amount: Decimal
    drawdown_pct: Decimal
    max_drawdown_pct: Decimal


class DisciplineBucketOut(BaseModel):
    band: str
    trade_count: int
    win_rate: Decimal | None
    net_pnl: Decimal
    avg_r: Decimal | None


class DisciplineOut(BaseModel):
    buckets: list[DisciplineBucketOut]
    saved_capital: Decimal


class SetupRowOut(BaseModel):
    setup_id: int
    name: str | None
    subtitle: str | None
    trade_count: int
    win_rate: Decimal | None
    net_pnl: Decimal
    expectancy: Decimal | None
    avg_execution_score: Decimal | None
    rank: str
    low_sample: bool


class XpOut(BaseModel):
    total_xp: int
    level: int
    xp_in_level: int
    xp_per_level: int
    win_streak: int


class DashboardOut(BaseModel):
    range: str
    account: str
    currency: str | None
    starting_balance: Decimal
    summary: SummaryOut
    equity: EquityOut
    discipline: DisciplineOut
    setups: list[SetupRowOut]
    recent_trades: list[TradeListItem]
    xp: XpOut
