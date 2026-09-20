from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import User
from scripts.seed_demo import HISTORY_DAYS, TRADE_COUNT, _resolve_user, reset_demo, seed_demo

END = date(2026, 9, 18)


def _seed(api_db, reset=False, end=END):
    with api_db() as session:
        user = session.scalar(select(User).where(User.email == "trader@example.com"))
        return seed_demo(session, user, end, reset=reset)


def _reset(api_db):
    with api_db() as session:
        reset_demo(session, session.scalar(select(User).where(User.email == "trader@example.com")))


def _all_trades(client):
    page = client.get("/trades", params={"page_size": 200}).json()
    assert page["total"] == len(page["items"])
    return page["items"]


def test_builds_the_mockup_world(client, api_db):
    assert _seed(api_db) == TRADE_COUNT

    accounts = client.get("/accounts").json()
    assert [(a["name"], a["label"], Decimal(a["starting_balance"])) for a in accounts] == [
        ("Apex 150k", "#APX-9821", Decimal(150000))
    ]
    instruments = {i["symbol"]: (Decimal(i["tick_size"]), Decimal(i["tick_value"])) for i in client.get("/instruments").json()}
    assert instruments == {"NQ": (Decimal("0.25"), Decimal("5")), "ES": (Decimal("0.25"), Decimal("12.5"))}
    setups = client.get("/setups").json()
    assert [s["name"] for s in setups] == ["celup kaki", "hulur kepala", "FVG Retest & Continuation", "FOMC News Spike"]
    for setup in setups:
        assert sum(Decimal(c["weight"]) for c in setup["criteria"]) == 100, setup["name"]
    tariff = client.get("/fee-profiles").json()[0]
    assert accounts[0]["fee_profile_id"] == tariff["id"]
    assert "not a real broker tariff" in tariff["notes"]


def test_generates_ninety_complete_trades_within_the_history_window(client, api_db):
    _seed(api_db)

    trades = _all_trades(client)
    earliest = datetime.combine(END - timedelta(days=HISTORY_DAYS), datetime.min.time(), tzinfo=timezone.utc)
    latest = datetime.combine(END + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    assert len(trades) == TRADE_COUNT
    assert all(t["setup"] is not None and t["execution_score"] is not None for t in trades)
    assert all(t["r_multiple"] is not None for t in trades)
    assert all(earliest <= datetime.fromisoformat(t["closed_at"]) < latest for t in trades)
    assert {t["symbol"] for t in trades} == {"NQ", "ES"}
    assert {t["setup"]["name"] for t in trades} == {
        "celup kaki",
        "hulur kepala",
        "FVG Retest & Continuation",
        "FOMC News Spike",
    }
    assert any(t["entry_fills"] > 1 for t in trades) and any(t["exit_fills"] > 1 for t in trades)
    assert all(Decimal(t["fees_total"]) > 0 for t in trades)


def test_dashboard_is_in_the_mockups_ballpark(client, api_db):
    _seed(api_db)

    dash = client.get("/dashboard").json()
    summary = dash["summary"]
    assert summary["trade_count"] == TRADE_COUNT
    assert Decimal("45") <= Decimal(summary["win_rate"]) <= Decimal("80")
    assert Decimal(summary["net_pnl"]) > 0
    assert Decimal(summary["profit_factor"]) > 1
    assert len(dash["setups"]) == 4
    assert {b["band"] for b in dash["discipline"]["buckets"] if b["trade_count"] > 0} >= {"elite", "rule_breach"}
    assert dash["xp"]["total_xp"] > 0


def test_the_same_end_date_always_gives_the_same_journal(client, api_db):
    _seed(api_db)
    first = client.get("/dashboard").json()
    first_trades = [(t["closed_at"], t["net_pnl"], t["execution_score"]) for t in _all_trades(client)]

    _seed(api_db, reset=True)

    assert client.get("/dashboard").json()["summary"] == first["summary"]
    assert [(t["closed_at"], t["net_pnl"], t["execution_score"]) for t in _all_trades(client)] == first_trades


def test_running_twice_needs_reset_and_reset_does_not_double_up(client, api_db):
    _seed(api_db)

    with pytest.raises(SystemExit):
        _seed(api_db)
    assert client.get("/trades").json()["total"] == TRADE_COUNT

    _seed(api_db, reset=True)
    assert client.get("/trades").json()["total"] == TRADE_COUNT
    assert len(client.get("/accounts").json()) == 1


def test_reset_removes_the_demo_rows_and_their_xp(client, api_db):
    _seed(api_db)

    _reset(api_db)

    assert client.get("/trades").json()["total"] == 0
    assert client.get("/accounts").json() == []
    assert client.get("/setups").json() == []
    assert client.get("/instruments").json() == []
    assert client.get("/fee-profiles").json() == []
    assert client.get("/dashboard").json()["xp"]["total_xp"] == 0


def test_reset_keeps_setups_and_instruments_you_made_yourself(client, api_db):
    own_setup = client.post("/setups", json={"name": "celup kaki", "criteria": [{"label": "Mine", "weight": "10"}]}).json()
    own_nq = client.post("/instruments", json={"symbol": "NQ", "name": "My NQ", "tick_size": "0.25", "tick_value": "5"}).json()

    _seed(api_db)
    _reset(api_db)

    assert [s["id"] for s in client.get("/setups").json()] == [own_setup["id"]]
    assert client.get(f"/setups/{own_setup['id']}").json()["criteria"][0]["label"] == "Mine"
    assert [i["id"] for i in client.get("/instruments").json()] == [own_nq["id"]]
    assert client.get(f"/instruments/{own_nq['id']}").json()["name"] == "My NQ"


def test_reset_keeps_a_demo_setup_that_you_have_traded(client, api_db, add_trade):
    _seed(api_db)
    celup = next(s for s in client.get("/setups").json() if s["name"] == "celup kaki")
    nq = next(i for i in client.get("/instruments").json() if i["symbol"] == "NQ")
    own_account = client.post("/accounts", json={"name": "Mine", "starting_balance": "1000"}).json()
    add_trade(own_account["id"], nq["id"], celup["id"])

    _reset(api_db)

    assert [s["name"] for s in client.get("/setups").json()] == ["celup kaki"]
    assert [i["symbol"] for i in client.get("/instruments").json()] == ["NQ"]
    assert [a["name"] for a in client.get("/accounts").json()] == ["Mine"]
    assert client.get("/trades").json()["total"] == 1


def test_other_users_are_untouched(client, other_client, api_db):
    _seed(api_db)

    assert other_client.get("/trades").json()["total"] == 0
    assert other_client.get("/setups").json() == []


def test_user_resolution(api_db, make_user):
    with api_db() as session:
        with pytest.raises(SystemExit):
            _resolve_user(session, None)

    make_user("only@example.com")
    with api_db() as session:
        assert _resolve_user(session, None).email == "only@example.com"
        assert _resolve_user(session, " ONLY@example.com ").email == "only@example.com"
        with pytest.raises(SystemExit):
            _resolve_user(session, "nobody@example.com")

    make_user("second@example.com")
    with api_db() as session:
        with pytest.raises(SystemExit):
            _resolve_user(session, None)
