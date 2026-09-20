from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Account,
    FeeComponent,
    FeeProfile,
    Instrument,
    Setup,
    SetupCriterion,
    Trade,
    TradeCriterionCheck,
    TradeFill,
    User,
)

OPENED = datetime(2026, 9, 8, 9, 35, tzinfo=timezone.utc)


def _seed(session: Session) -> dict:
    user = User(email="a@example.com", password_hash="x")
    session.add(user)
    session.flush()
    account = Account(user_id=user.id, name="Apex 150k", starting_balance=Decimal("150000"))
    instrument = Instrument(user_id=user.id, symbol="NQ", tick_size=Decimal("0.25"), tick_value=Decimal("5"))
    setup = Setup(user_id=user.id, name="celup kaki")
    session.add_all([account, instrument, setup])
    session.flush()
    return {"user": user, "account": account, "instrument": instrument, "setup": setup}


def _trade(ids: dict, **overrides) -> Trade:
    fields = dict(
        account_id=ids["account"].id,
        instrument_id=ids["instrument"].id,
        setup_id=ids["setup"].id,
        direction="long",
        opened_at=OPENED,
        closed_at=OPENED + timedelta(minutes=39),
        quantity=Decimal("2"),
        avg_entry=Decimal("20379"),
        avg_exit=Decimal("20394.125"),
        gross_pnl=Decimal("605"),
        fees_total=Decimal("14.64"),
        net_pnl=Decimal("590.36"),
    )
    return Trade(**{**fields, **overrides})


def _rejected(session: Session, obj) -> bool:
    try:
        with session.begin_nested():
            session.add(obj)
            session.flush()
    except IntegrityError:
        return True
    return False


def test_trade_round_trips_with_children(db_session):
    ids = _seed(db_session)
    trade = _trade(ids, tags=["London sweep", "Runner"])
    trade.fills = [
        TradeFill(fill_type="entry", price=Decimal("20380.25"), quantity=Decimal("1"), filled_at=OPENED),
        TradeFill(fill_type="exit", price=Decimal("20391.00"), quantity=Decimal("1"), filled_at=OPENED),
    ]
    db_session.add(trade)
    db_session.flush()
    db_session.expire_all()

    saved = db_session.get(Trade, trade.id)
    assert saved.tags == ["London sweep", "Runner"]
    assert [f.fill_type for f in saved.fills] == ["entry", "exit"]
    assert saved.net_pnl == Decimal("590.36")


def test_trade_rejects_bad_direction(db_session):
    ids = _seed(db_session)
    assert _rejected(db_session, _trade(ids, direction="flat"))


def test_trade_rejects_non_positive_quantity(db_session):
    ids = _seed(db_session)
    assert _rejected(db_session, _trade(ids, quantity=Decimal("0")))


def test_trade_rejects_close_before_open(db_session):
    ids = _seed(db_session)
    assert _rejected(db_session, _trade(ids, closed_at=OPENED - timedelta(minutes=1)))


@pytest.mark.parametrize("score", [-1, 101])
def test_trade_rejects_score_outside_0_to_100(db_session, score):
    ids = _seed(db_session)
    assert _rejected(db_session, _trade(ids, execution_score=score))


def test_trade_accepts_null_and_edge_scores(db_session):
    ids = _seed(db_session)
    for score in (None, 0, 100):
        assert not _rejected(db_session, _trade(ids, execution_score=score))


def test_fill_rejects_bad_type_and_quantity(db_session):
    ids = _seed(db_session)
    trade = _trade(ids)
    db_session.add(trade)
    db_session.flush()
    good = dict(trade_id=trade.id, price=Decimal("1"), quantity=Decimal("1"), filled_at=OPENED)
    assert _rejected(db_session, TradeFill(fill_type="hold", **good))
    assert _rejected(db_session, TradeFill(fill_type="entry", **{**good, "quantity": Decimal("0")}))
    assert not _rejected(db_session, TradeFill(fill_type="entry", **good))


@pytest.mark.parametrize("weight", [Decimal("0"), Decimal("-5")])
def test_criterion_weight_must_be_positive(db_session, weight):
    ids = _seed(db_session)
    criterion = SetupCriterion(setup_id=ids["setup"].id, label="Wait for sweep", weight=weight)
    assert _rejected(db_session, criterion)


def test_fee_component_basis_and_amount(db_session):
    ids = _seed(db_session)
    profile = FeeProfile(user_id=ids["user"].id, name="Example tariff")
    db_session.add(profile)
    db_session.flush()
    assert _rejected(db_session, FeeComponent(fee_profile_id=profile.id, name="x", amount=Decimal("1"), basis="per_lot"))
    assert _rejected(db_session, FeeComponent(fee_profile_id=profile.id, name="x", amount=Decimal("-1"), basis="per_fill"))
    assert not _rejected(db_session, FeeComponent(fee_profile_id=profile.id, name="x", amount=Decimal("0"), basis="per_fill"))


def test_instrument_tick_values_positive_and_symbol_unique_per_user(db_session):
    ids = _seed(db_session)
    uid = ids["user"].id
    assert _rejected(db_session, Instrument(user_id=uid, symbol="ES", tick_size=Decimal("0"), tick_value=Decimal("12.5")))
    assert _rejected(db_session, Instrument(user_id=uid, symbol="ES", tick_size=Decimal("0.25"), tick_value=Decimal("0")))
    assert _rejected(db_session, Instrument(user_id=uid, symbol="NQ", tick_size=Decimal("0.25"), tick_value=Decimal("5")))


def test_account_rejects_negative_starting_balance(db_session):
    ids = _seed(db_session)
    assert _rejected(db_session, Account(user_id=ids["user"].id, name="x", starting_balance=Decimal("-1")))


def test_one_check_per_criterion_per_trade(db_session):
    ids = _seed(db_session)
    criterion = SetupCriterion(setup_id=ids["setup"].id, label="Wait for sweep", weight=Decimal("25"))
    trade = _trade(ids)
    db_session.add_all([criterion, trade])
    db_session.flush()
    check = dict(trade_id=trade.id, criterion_id=criterion.id, checked=True)
    assert not _rejected(db_session, TradeCriterionCheck(**check))
    assert _rejected(db_session, TradeCriterionCheck(**check))


def test_used_setup_and_account_cannot_be_deleted(db_session):
    ids = _seed(db_session)
    db_session.add(_trade(ids))
    db_session.flush()
    for key in ("setup", "account", "instrument"):
        try:
            with db_session.begin_nested():
                db_session.delete(ids[key])
                db_session.flush()
        except IntegrityError:
            db_session.expire_all()
        else:
            pytest.fail(f"{key} with trades was deleted")
