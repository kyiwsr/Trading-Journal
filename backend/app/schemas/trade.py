from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.base import Money, Name, PositivePrice

Direction = Literal["long", "short"]
FillType = Literal["entry", "exit"]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
Ticks = Annotated[Decimal, Field(ge=0, max_digits=20, decimal_places=8)]


class FillIn(BaseModel):
    fill_type: FillType
    price: PositivePrice
    quantity: PositivePrice
    filled_at: AwareDatetime
    note: str | None = Field(default=None, max_length=300)


class CriterionCheckIn(BaseModel):
    criterion_id: int
    checked: bool
    note: str | None = None


class FeeLineIn(BaseModel):
    name: Name
    amount: Money


class TradeIn(BaseModel):
    """Full trade state. Everything derived (quantity, averages, P&L, R, score, open/close times) is computed server-side."""

    model_config = ConfigDict(extra="forbid")

    account_id: int
    instrument_id: int
    setup_id: int | None = None
    direction: Direction
    session: str | None = Field(default=None, max_length=60)
    tags: list[Tag] = Field(default_factory=list, max_length=20)
    stop_price: PositivePrice | None = None
    target_price: PositivePrice | None = None
    slippage_ticks: Ticks = Decimal(0)
    fills: list[FillIn] = Field(min_length=2, max_length=50)
    criteria_checks: list[CriterionCheckIn] = Field(default_factory=list)
    fees: list[FeeLineIn] = Field(default_factory=list)
    pre_trade_focus: str | None = None
    environment: str | None = None
    debrief_notes: str | None = None
    screenshot_path: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _check_fills(self) -> "TradeIn":
        entries = [f for f in self.fills if f.fill_type == "entry"]
        exits = [f for f in self.fills if f.fill_type == "exit"]
        if not entries or not exits:
            raise ValueError("A trade needs at least one entry fill and one exit fill")
        if sum(f.quantity for f in entries) != sum(f.quantity for f in exits):
            raise ValueError("Entry and exit quantities must match")
        if min(f.filled_at for f in exits) < min(f.filled_at for f in entries):
            raise ValueError("An exit fill cannot come before the first entry fill")
        return self


class InstrumentBrief(BaseModel):
    id: int
    symbol: str
    name: str | None
    tick_size: Decimal
    tick_value: Decimal


class SetupBrief(BaseModel):
    id: int
    name: str
    subtitle: str | None


class FillOut(BaseModel):
    id: int
    fill_type: FillType
    price: Decimal
    quantity: Decimal
    filled_at: datetime
    note: str | None
    # Set on exit fills only: points and P&L measured against the trade's average entry.
    realized_points: Decimal | None
    realized_pnl: Decimal | None


class FeeLineOut(BaseModel):
    name: str
    amount: Decimal


class CriterionCheckOut(BaseModel):
    criterion_id: int
    label: str
    weight: Decimal
    checked: bool
    note: str | None


class TradeDetailOut(BaseModel):
    id: int
    account_id: int
    instrument: InstrumentBrief
    setup: SetupBrief | None
    direction: Direction
    session: str | None
    tags: list[str]
    opened_at: datetime
    closed_at: datetime
    stop_price: Decimal | None
    target_price: Decimal | None
    quantity: Decimal
    avg_entry: Decimal
    avg_exit: Decimal
    points: Decimal
    risk_amount: Decimal | None
    gross_pnl: Decimal
    fees_total: Decimal
    slippage_ticks: Decimal
    slippage_cost: Decimal
    net_pnl: Decimal
    r_multiple: Decimal | None
    execution_score: int | None
    score_band: str | None
    compliant: bool | None
    pre_trade_focus: str | None
    environment: str | None
    debrief_notes: str | None
    screenshot_path: str | None
    screenshot_url: str | None
    fills: list[FillOut]
    fees: list[FeeLineOut]
    criteria: list[CriterionCheckOut]
    xp_points: int | None
    prev_trade_id: int | None
    next_trade_id: int | None
    created_at: datetime


class TradeListItem(BaseModel):
    id: int
    account_id: int
    opened_at: datetime
    closed_at: datetime
    session: str | None
    symbol: str
    instrument_name: str | None
    direction: Direction
    setup: SetupBrief | None
    entry_fills: int
    exit_fills: int
    quantity: Decimal
    avg_entry: Decimal
    avg_exit: Decimal
    gross_pnl: Decimal
    fees_total: Decimal
    net_pnl: Decimal
    result: Literal["win", "loss", "breakeven"]
    r_multiple: Decimal | None
    execution_score: int | None
    score_band: str | None
    compliant: bool | None
    tags: list[str]
    has_screenshot: bool


class TradeSummaryOut(BaseModel):
    """Totals for every trade matching the filters, not just the returned page."""

    trades: int
    wins: int
    losses: int
    breakeven: int
    net_pnl: Decimal
    fees_total: Decimal
    win_rate: Decimal | None
    profit_factor: Decimal | None
    avg_score: Decimal | None
    scored_count: int
    compliant_count: int
    elite_count: int
    avg_hold_seconds: int | None


class TradeListOut(BaseModel):
    items: list[TradeListItem]
    summary: TradeSummaryOut
    total: int
    page: int
    page_size: int
