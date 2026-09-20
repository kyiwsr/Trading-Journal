import csv
import io
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from sqlalchemy import Text, cast, func, or_, select
from sqlalchemy.orm import Session

from app.deps import get_owned
from app.models import Account, Instrument, Setup, Trade, TradeFill, User
from app.schemas.trade import SetupBrief, TradeListItem, TradeSummaryOut
from app.services import metrics, scoring

RangeName = Literal["30D", "90D", "YTD", "ALL"]
SortField = Literal["closed_at", "opened_at", "net_pnl", "r_multiple", "execution_score"]
Order = Literal["asc", "desc"]

SORT_COLUMNS = {
    "closed_at": Trade.closed_at,
    "opened_at": Trade.opened_at,
    "net_pnl": Trade.net_pnl,
    "r_multiple": Trade.r_multiple,
    "execution_score": Trade.execution_score,
}

CSV_COLUMNS = [
    "closed_at",
    "opened_at",
    "account",
    "symbol",
    "side",
    "setup",
    "session",
    "entry_fills",
    "exit_fills",
    "quantity",
    "avg_entry",
    "avg_exit",
    "gross_pnl",
    "fees_total",
    "net_pnl",
    "result",
    "r_multiple",
    "execution_score",
    "tags",
]


def get_today() -> date:
    return datetime.now(timezone.utc).date()


def range_start(name: str | None, today: date) -> date | None:
    """First day of a preset window; 30D and 90D count today as day one."""
    if name == "30D":
        return today - timedelta(days=29)
    if name == "90D":
        return today - timedelta(days=89)
    if name == "YTD":
        return date(today.year, 1, 1)
    return None


def resolve_account(db: Session, user: User, account: str) -> Account | None:
    """`all` means every account; an id must be one of the user's own."""
    if account.lower() == "all":
        return None
    return get_owned(db, Account, int(account), user)


@dataclass(frozen=True)
class TradeFilters:
    account_id: int | None = None
    setup_id: int | None = None
    side: str | None = None
    result: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    q: str | None = None


def _utc_midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def _filtered(stmt, filters: TradeFilters):
    if filters.account_id is not None:
        stmt = stmt.where(Trade.account_id == filters.account_id)
    if filters.setup_id is not None:
        stmt = stmt.where(Trade.setup_id == filters.setup_id)
    if filters.side is not None:
        stmt = stmt.where(Trade.direction == filters.side)
    if filters.result == "win":
        stmt = stmt.where(Trade.net_pnl > 0)
    elif filters.result == "loss":
        stmt = stmt.where(Trade.net_pnl < 0)
    elif filters.result == "breakeven":
        stmt = stmt.where(Trade.net_pnl == 0)
    if filters.date_from is not None:
        stmt = stmt.where(Trade.closed_at >= _utc_midnight(filters.date_from))
    if filters.date_to is not None:
        stmt = stmt.where(Trade.closed_at < _utc_midnight(filters.date_to + timedelta(days=1)))
    if filters.q:
        searched = [
            Instrument.symbol,
            Setup.name,
            Trade.pre_trade_focus,
            Trade.environment,
            Trade.debrief_notes,
            cast(Trade.tags, Text),
        ]
        stmt = stmt.where(or_(*(column.icontains(filters.q, autoescape=True) for column in searched)))
    return stmt


def _joined(stmt, user: User, filters: TradeFilters):
    stmt = (
        stmt.select_from(Trade)
        .join(Account, Account.id == Trade.account_id)
        .join(Instrument, Instrument.id == Trade.instrument_id)
        .outerjoin(Setup, Setup.id == Trade.setup_id)
        .where(Account.user_id == user.id)
    )
    return _filtered(stmt, filters)


def _fill_count(kind: str):
    return (
        select(func.count(TradeFill.id))
        .where(TradeFill.trade_id == Trade.id, TradeFill.fill_type == kind)
        .correlate(Trade)
        .scalar_subquery()
    )


def _ledger_rows(user: User, filters: TradeFilters):
    return _joined(
        select(
            Trade,
            Account.name.label("account_name"),
            Instrument.symbol,
            Instrument.name.label("instrument_name"),
            Setup.id.label("setup_id"),
            Setup.name.label("setup_name"),
            Setup.subtitle.label("setup_subtitle"),
            _fill_count("entry").label("entry_fills"),
            _fill_count("exit").label("exit_fills"),
        ),
        user,
        filters,
    )


def result_of(net_pnl) -> str:
    return "win" if net_pnl > 0 else "loss" if net_pnl < 0 else "breakeven"


def _item(row, compliance_cutoff: int) -> TradeListItem:
    trade: Trade = row.Trade
    band = scoring.score_band(trade.execution_score)
    return TradeListItem(
        id=trade.id,
        account_id=trade.account_id,
        opened_at=trade.opened_at,
        closed_at=trade.closed_at,
        session=trade.session,
        symbol=row.symbol,
        instrument_name=row.instrument_name,
        direction=trade.direction,
        setup=SetupBrief(id=row.setup_id, name=row.setup_name, subtitle=row.setup_subtitle) if row.setup_id else None,
        entry_fills=row.entry_fills,
        exit_fills=row.exit_fills,
        quantity=trade.quantity,
        avg_entry=trade.avg_entry,
        avg_exit=trade.avg_exit,
        gross_pnl=trade.gross_pnl,
        fees_total=trade.fees_total,
        net_pnl=trade.net_pnl,
        result=result_of(trade.net_pnl),
        r_multiple=trade.r_multiple,
        execution_score=trade.execution_score,
        score_band=band.value if band else None,
        compliant=scoring.compliance(trade.execution_score, compliance_cutoff),
        tags=list(trade.tags or []),
        has_screenshot=trade.screenshot_path is not None,
    )


def trade_summary(db: Session, user: User, filters: TradeFilters) -> TradeSummaryOut:
    """Totals over every matching trade, computed with the same service the dashboard uses."""
    stmt = _joined(
        select(
            Trade.opened_at,
            Trade.closed_at,
            Trade.gross_pnl,
            Trade.fees_total,
            Trade.net_pnl,
            Trade.r_multiple,
            Trade.execution_score,
        ),
        user,
        filters,
    )
    rows = [metrics.TradeRow(**row._asdict()) for row in db.execute(stmt)]
    s = metrics.ledger_summary(rows, user.compliance_cutoff)
    return TradeSummaryOut(
        trades=s.trade_count,
        wins=s.wins,
        losses=s.losses,
        breakeven=s.breakevens,
        net_pnl=s.net_pnl,
        fees_total=s.fees_total,
        win_rate=s.win_rate,
        profit_factor=s.profit_factor,
        avg_score=s.avg_execution_score,
        scored_count=s.scored_count,
        compliant_count=s.compliant_count,
        elite_count=s.elite_count,
        avg_hold_seconds=s.avg_hold_seconds,
    )


def _ordered(stmt, sort_by: str, order: str):
    column = SORT_COLUMNS[sort_by]
    direction = column.asc() if order == "asc" else column.desc()
    tie_break = Trade.id.asc() if order == "asc" else Trade.id.desc()
    return stmt.order_by(direction.nulls_last(), tie_break)


def list_trades(
    db: Session, user: User, filters: TradeFilters, sort_by: str, order: str, page: int, page_size: int
) -> tuple[list[TradeListItem], int]:
    total = db.scalar(_joined(select(func.count(Trade.id)), user, filters))
    stmt = _ordered(_ledger_rows(user, filters), sort_by, order).limit(page_size).offset((page - 1) * page_size)
    return [_item(row, user.compliance_cutoff) for row in db.execute(stmt)], total


def all_trades(db: Session, user: User, filters: TradeFilters, sort_by: str, order: str) -> list[tuple[str, TradeListItem]]:
    """Every matching trade, each with its account name, for the export."""
    rows = db.execute(_ordered(_ledger_rows(user, filters), sort_by, order))
    return [(row.account_name, _item(row, user.compliance_cutoff)) for row in rows]


def _text_cell(value: str | None) -> str:
    """Spreadsheets run cells that start with these characters as formulas, so text gets a leading quote."""
    if value and value[0] in "=+-@\t\r":
        return "'" + value
    return value or ""


def _utc_iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat()


def trades_csv(rows: list[tuple[str, TradeListItem]]) -> str:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(CSV_COLUMNS)
    for account_name, t in rows:
        writer.writerow(
            [
                _utc_iso(t.closed_at),
                _utc_iso(t.opened_at),
                _text_cell(account_name),
                _text_cell(t.symbol),
                t.direction,
                _text_cell(t.setup.name if t.setup else None),
                _text_cell(t.session),
                t.entry_fills,
                t.exit_fills,
                t.quantity,
                t.avg_entry,
                t.avg_exit,
                t.gross_pnl,
                t.fees_total,
                t.net_pnl,
                t.result,
                "" if t.r_multiple is None else t.r_multiple,
                "" if t.execution_score is None else t.execution_score,
                "; ".join(_text_cell(tag) for tag in t.tags),
            ]
        )
    return out.getvalue()
