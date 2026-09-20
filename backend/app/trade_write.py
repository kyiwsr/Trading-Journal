from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app import crud
from app.models import (
    Account,
    FeeProfile,
    Instrument,
    Setup,
    Trade,
    TradeCriterionCheck,
    TradeFee,
    TradeFill,
    User,
    XpEvent,
)
from app.schemas.trade import (
    CriterionCheckOut,
    FeeLineIn,
    FeeLineOut,
    FillOut,
    InstrumentBrief,
    SetupBrief,
    TradeDetailOut,
    TradeIn,
)
from app.services import fees as fee_service
from app.services import scoring, trade_math, xp
from app.services.rounding import to_cents
from app.storage import Storage


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


def _own_row(db: Session, model, row_id: int, user: User, field: str):
    row = db.get(model, row_id)
    if row is None or row.user_id != user.id:
        raise _unprocessable(f"{field} does not exist")
    return row


def get_owned_trade(db: Session, trade_id: int, user: User) -> Trade:
    """Trades belong to a user through their account; other users' trades answer 404 like missing ones."""
    trade = db.scalar(
        select(Trade).join(Account, Account.id == Trade.account_id).where(Trade.id == trade_id, Account.user_id == user.id)
    )
    if trade is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trade not found")
    return trade


def delete_trade(db: Session, trade: Trade) -> None:
    for event in db.scalars(select(XpEvent).where(XpEvent.trade_id == trade.id)):
        db.delete(event)
    db.delete(trade)
    crud.commit(db)


def _check_screenshot_path(user: User, path: str | None) -> None:
    if path is None:
        return
    if not path.startswith(f"{user.id}/") or ".." in path.split("/"):
        raise _unprocessable("screenshot_path is not one of your uploads")


def _resolve_checks(setup: Setup | None, body: TradeIn) -> dict[int, TradeCriterionCheck]:
    """One check per criterion of the setup; criteria the client left out are stored as unchecked."""
    given = {c.criterion_id: c for c in body.criteria_checks}
    if len(given) != len(body.criteria_checks):
        raise _unprocessable("A criterion appears more than once")
    known = {c.id for c in setup.criteria} if setup else set()
    if unknown := sorted(set(given) - known):
        raise _unprocessable(f"Criteria {unknown} do not belong to the chosen setup")
    return {
        c.id: TradeCriterionCheck(
            criterion_id=c.id,
            checked=given[c.id].checked if c.id in given else False,
            note=given[c.id].note if c.id in given else None,
        )
        for c in (setup.criteria if setup else [])
    }


def _fee_lines(
    db: Session, account: Account, fills: list[trade_math.Fill], overrides: list[FeeLineIn]
) -> list[fee_service.FeeLine]:
    profile = db.get(FeeProfile, account.fee_profile_id) if account.fee_profile_id else None
    components = [
        fee_service.FeeComponent(c.name, c.amount, c.basis) for c in (profile.components if profile else [])
    ]
    lines = fee_service.apply_fees(components, fills)
    for override in overrides:
        amount = to_cents(override.amount)
        at = next((i for i, line in enumerate(lines) if line.name.casefold() == override.name.casefold()), None)
        if at is None:
            lines.append(fee_service.FeeLine(override.name, amount))
        else:
            lines[at] = fee_service.FeeLine(lines[at].name, amount)
    return lines


def save_trade(db: Session, user: User, body: TradeIn, trade: Trade | None = None) -> Trade:
    """Create a trade, or replace an existing one, computing every derived field with the M1 services."""
    account = _own_row(db, Account, body.account_id, user, "account_id")
    instrument = _own_row(db, Instrument, body.instrument_id, user, "instrument_id")
    setup = _own_row(db, Setup, body.setup_id, user, "setup_id") if body.setup_id is not None else None
    _check_screenshot_path(user, body.screenshot_path)
    checks = _resolve_checks(setup, body)

    fills = [trade_math.Fill(f.fill_type, f.price, f.quantity) for f in body.fills]
    fee_lines = _fee_lines(db, account, fills, body.fees)
    result = trade_math.compute_trade(
        body.direction,
        fills,
        trade_math.Instrument(instrument.tick_size, instrument.tick_value),
        stop_price=body.stop_price,
        fees_total=fee_service.total_fees(fee_lines),
        slippage_ticks=body.slippage_ticks,
    )
    score = scoring.execution_score(
        [scoring.CriterionResult(c.weight, checks[c.id].checked) for c in (setup.criteria if setup else [])]
    )

    if trade is None:
        trade = Trade()
        db.add(trade)
    else:
        for collection in (trade.criteria_checks, trade.fills, trade.fees):
            collection.clear()
        # Flushed before the new rows go in so the (trade, criterion) unique key never sees old and new together.
        db.flush()

    trade.account_id = account.id
    trade.instrument_id = instrument.id
    trade.setup_id = setup.id if setup else None
    trade.direction = body.direction
    trade.session = body.session
    trade.tags = body.tags
    trade.opened_at = min(f.filled_at for f in body.fills if f.fill_type == "entry")
    trade.closed_at = max(f.filled_at for f in body.fills if f.fill_type == "exit")
    trade.stop_price = body.stop_price
    trade.target_price = body.target_price
    trade.quantity = result.quantity
    trade.avg_entry = result.avg_entry
    trade.avg_exit = result.avg_exit
    trade.risk_amount = result.risk_amount
    trade.gross_pnl = result.gross_pnl
    trade.fees_total = fee_service.total_fees(fee_lines)
    trade.slippage_ticks = body.slippage_ticks
    trade.net_pnl = result.net_pnl
    trade.r_multiple = result.r_multiple
    trade.execution_score = score
    trade.pre_trade_focus = body.pre_trade_focus
    trade.environment = body.environment
    trade.debrief_notes = body.debrief_notes
    trade.screenshot_path = body.screenshot_path
    trade.fills = [
        TradeFill(fill_type=f.fill_type, price=f.price, quantity=f.quantity, filled_at=f.filled_at, note=f.note)
        for f in sorted(body.fills, key=lambda f: f.filled_at)
    ]
    trade.fees = [TradeFee(name=line.name, amount=line.amount) for line in fee_lines]
    trade.criteria_checks = list(checks.values())
    db.flush()

    _replace_xp(db, user, trade)
    crud.commit(db)
    return trade


def _replace_xp(db: Session, user: User, trade: Trade) -> None:
    for event in db.scalars(select(XpEvent).where(XpEvent.trade_id == trade.id)):
        db.delete(event)
    if trade.execution_score is not None:
        db.add(XpEvent(user_id=user.id, trade_id=trade.id, points=xp.xp_for_trade(trade.execution_score)))


def _neighbour_id(db: Session, user: User, trade: Trade, older: bool) -> int | None:
    key_before = or_(
        Trade.closed_at < trade.closed_at, and_(Trade.closed_at == trade.closed_at, Trade.id < trade.id)
    )
    key_after = or_(
        Trade.closed_at > trade.closed_at, and_(Trade.closed_at == trade.closed_at, Trade.id > trade.id)
    )
    order = (Trade.closed_at.desc(), Trade.id.desc()) if older else (Trade.closed_at, Trade.id)
    stmt = (
        select(Trade.id)
        .join(Account, Account.id == Trade.account_id)
        .where(Account.user_id == user.id, key_before if older else key_after)
        .order_by(*order)
        .limit(1)
    )
    return db.scalar(stmt)


def build_detail(db: Session, trade: Trade, user: User, storage: Storage) -> TradeDetailOut:
    instrument = db.get(Instrument, trade.instrument_id)
    setup = db.get(Setup, trade.setup_id) if trade.setup_id else None
    tick = trade_math.Instrument(instrument.tick_size, instrument.tick_value)
    labels = {c.id: c for c in setup.criteria} if setup else {}

    fills = [trade_math.Fill(f.fill_type, f.price, f.quantity) for f in trade.fills]
    points = trade_math.compute_trade(trade.direction, fills, tick).points

    fill_rows = []
    for stored, fill in zip(trade.fills, fills):
        realized = trade_math.exit_realized(trade.direction, trade.avg_entry, fill, tick) if fill.fill_type == "exit" else None
        fill_rows.append(
            FillOut(
                id=stored.id,
                fill_type=stored.fill_type,
                price=stored.price,
                quantity=stored.quantity,
                filled_at=stored.filled_at,
                note=stored.note,
                realized_points=realized.points if realized else None,
                realized_pnl=realized.pnl if realized else None,
            )
        )

    return TradeDetailOut(
        id=trade.id,
        account_id=trade.account_id,
        instrument=InstrumentBrief(
            id=instrument.id,
            symbol=instrument.symbol,
            name=instrument.name,
            tick_size=instrument.tick_size,
            tick_value=instrument.tick_value,
        ),
        setup=SetupBrief(id=setup.id, name=setup.name, subtitle=setup.subtitle) if setup else None,
        direction=trade.direction,
        session=trade.session,
        tags=list(trade.tags or []),
        opened_at=trade.opened_at,
        closed_at=trade.closed_at,
        stop_price=trade.stop_price,
        target_price=trade.target_price,
        quantity=trade.quantity,
        avg_entry=trade.avg_entry,
        avg_exit=trade.avg_exit,
        points=points,
        risk_amount=trade.risk_amount,
        gross_pnl=trade.gross_pnl,
        fees_total=trade.fees_total,
        slippage_ticks=trade.slippage_ticks,
        slippage_cost=trade_math.slippage_cost(trade.slippage_ticks, tick, trade.quantity),
        net_pnl=trade.net_pnl,
        r_multiple=trade.r_multiple,
        execution_score=trade.execution_score,
        score_band=band.value if (band := scoring.score_band(trade.execution_score)) else None,
        compliant=scoring.compliance(trade.execution_score, user.compliance_cutoff),
        pre_trade_focus=trade.pre_trade_focus,
        environment=trade.environment,
        debrief_notes=trade.debrief_notes,
        screenshot_path=trade.screenshot_path,
        screenshot_url=storage.signed_read_url(trade.screenshot_path) if trade.screenshot_path else None,
        fills=fill_rows,
        fees=[FeeLineOut(name=f.name, amount=f.amount) for f in trade.fees],
        criteria=[
            CriterionCheckOut(
                criterion_id=c.criterion_id,
                label=labels[c.criterion_id].label,
                weight=labels[c.criterion_id].weight,
                checked=c.checked,
                note=c.note,
            )
            for c in trade.criteria_checks
        ],
        xp_points=db.scalar(select(XpEvent.points).where(XpEvent.trade_id == trade.id)),
        prev_trade_id=_neighbour_id(db, user, trade, older=True),
        next_trade_id=_neighbour_id(db, user, trade, older=False),
        created_at=trade.created_at,
    )
