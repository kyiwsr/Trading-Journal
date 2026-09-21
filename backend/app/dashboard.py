from datetime import date, datetime, time, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Account, Setup, Trade, User, XpEvent
from app.schemas.dashboard import (
    DashboardOut,
    DisciplineBucketOut,
    DisciplineOut,
    EquityOut,
    EquityPointOut,
    SetupRowOut,
    SummaryOut,
    XpOut,
)
from app.services import metrics, xp
from app.trade_queries import TradeFilters, list_trades, range_start, result_of

RECENT_TRADES = 5


def _shared_currency(accounts: list[Account]) -> str | None:
    currencies = {a.currency for a in accounts}
    return currencies.pop() if len(currencies) == 1 else None


def _trade_rows(db: Session, accounts: list[Account]):
    """Every trade of the given accounts in close order, with the setup name for the playbook table."""
    stmt = (
        select(Trade, Setup.name)
        .outerjoin(Setup, Setup.id == Trade.setup_id)
        .where(Trade.account_id.in_([a.id for a in accounts]))
        .order_by(Trade.closed_at, Trade.id)
    )
    return db.execute(stmt).all()


def _subtitles(db: Session, setup_ids: list[int]) -> dict[int, str | None]:
    if not setup_ids:
        return {}
    return dict(db.execute(select(Setup.id, Setup.subtitle).where(Setup.id.in_(setup_ids))).tuples().all())


def _metric_row(trade: Trade, setup_name: str | None) -> metrics.TradeRow:
    return metrics.TradeRow(
        closed_at=trade.closed_at,
        gross_pnl=trade.gross_pnl,
        fees_total=trade.fees_total,
        net_pnl=trade.net_pnl,
        r_multiple=trade.r_multiple,
        execution_score=trade.execution_score,
        setup_id=trade.setup_id,
        setup_name=setup_name,
    )


def _xp_block(db: Session, user: User) -> XpOut:
    """The HUD is lifetime progress, so it ignores the account and range filters."""
    total = db.scalar(select(func.coalesce(func.sum(XpEvent.points), 0)).where(XpEvent.user_id == user.id))
    net_pnls = db.scalars(
        select(Trade.net_pnl)
        .join(Account, Account.id == Trade.account_id)
        .where(Account.user_id == user.id)
        .order_by(Trade.closed_at, Trade.id)
    ).all()
    progress = xp.level_progress(total)
    return XpOut(
        total_xp=total,
        level=progress.level,
        xp_in_level=progress.xp_in_level,
        xp_per_level=progress.xp_per_level,
        win_streak=xp.win_streak(net_pnls),
    )


def build_dashboard(
    db: Session, user: User, account: Account | None, range_name: str, today: date
) -> DashboardOut:
    accounts = [account] if account else list(db.scalars(select(Account).where(Account.user_id == user.id)))
    starting_balance = sum((a.starting_balance for a in accounts), Decimal(0))
    start = range_start(range_name, today)
    window_start = datetime.combine(start, time.min, tzinfo=timezone.utc) if start else None

    rows = _trade_rows(db, accounts) if accounts else []
    before = [t for t, _ in rows if window_start and t.closed_at < window_start]
    in_window = [(t, name) for t, name in rows if not (window_start and t.closed_at < window_start)]
    # A range opens with the balance the account had at that moment, not with its starting balance.
    baseline = starting_balance + sum((t.net_pnl for t in before), Decimal(0))

    metric_rows = [_metric_row(t, name) for t, name in in_window]
    setup_rows = metrics.setup_table(metric_rows)
    subtitles = _subtitles(db, [row.setup_id for row in setup_rows])
    summary = metrics.summarize(metric_rows, baseline)
    curve = metrics.equity_curve(metric_rows, baseline)
    discipline = metrics.discipline_report(metric_rows)

    # equity_curve keeps the order it is given, so its points line up with in_window one to one.
    points = [
        EquityPointOut(
            closed_at=point.closed_at,
            equity=point.equity,
            trade_id=trade.id,
            net_pnl=trade.net_pnl,
            result=result_of(trade.net_pnl),
        )
        for point, (trade, _) in zip(curve.points, in_window)
    ]

    recent, _ = list_trades(
        db,
        user,
        TradeFilters(account_id=account.id if account else None, date_from=start),
        "closed_at",
        "desc",
        1,
        RECENT_TRADES,
    )

    return DashboardOut(
        range=range_name,
        account=str(account.id) if account else "all",
        currency=_shared_currency(accounts),
        starting_balance=starting_balance,
        summary=SummaryOut(**vars(summary)),
        equity=EquityOut(
            baseline=baseline,
            points=points,
            peak=curve.peak,
            current=curve.current,
            drawdown_amount=curve.drawdown_amount,
            drawdown_pct=curve.drawdown_pct,
            max_drawdown_pct=curve.max_drawdown_pct,
        ),
        discipline=DisciplineOut(
            buckets=[
                DisciplineBucketOut(
                    band=b.band.value,
                    trade_count=b.trade_count,
                    win_rate=b.win_rate,
                    net_pnl=b.net_pnl,
                    avg_r=b.avg_r,
                )
                for b in discipline.buckets
            ],
            saved_capital=discipline.saved_capital,
        ),
        setups=[
            SetupRowOut(
                setup_id=row.setup_id,
                name=row.name,
                subtitle=subtitles.get(row.setup_id),
                trade_count=row.trade_count,
                win_rate=row.win_rate,
                net_pnl=row.net_pnl,
                expectancy=row.expectancy,
                avg_execution_score=row.avg_execution_score,
                rank=row.rank.value,
                low_sample=row.low_sample,
            )
            for row in setup_rows
        ],
        recent_trades=recent,
        xp=_xp_block(db, user),
    )
