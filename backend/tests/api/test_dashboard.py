from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

TODAY = date(2026, 9, 20)


@pytest.fixture(autouse=True)
def fixed_today(client):
    from app.main import app
    from app.trade_queries import get_today

    app.dependency_overrides[get_today] = lambda: TODAY


@pytest.fixture
def desk(client):
    """Two fee-free accounts on NQ, where one point on one contract is $20."""
    nq = client.post("/instruments", json={"symbol": "NQ", "tick_size": "0.25", "tick_value": "5"}).json()
    return SimpleNamespace(
        nq=nq,
        a=client.post("/accounts", json={"name": "A", "starting_balance": "10000"}).json(),
        b=client.post("/accounts", json={"name": "B", "starting_balance": "5000"}).json(),
        celup=client.post(
            "/setups",
            json={
                "name": "celup kaki",
                "criteria": [{"label": "Sweep", "weight": "60"}, {"label": "Retest", "weight": "40"}],
            },
        ).json(),
        hulur=client.post(
            "/setups", json={"name": "hulur kepala", "criteria": [{"label": "Opening range", "weight": "100"}]}
        ).json(),
    )


def _trade(client, desk, account, when, exit_price, *, direction="long", setup=None, checked=()):
    """A 1-lot trade with a 5 point stop, so $100 of risk and R equals P&L / 100."""
    start = datetime(when.year, when.month, when.day, 10, 0, tzinfo=timezone.utc)
    checks = (
        [{"criterion_id": c["id"], "checked": i in checked} for i, c in enumerate(setup["criteria"])] if setup else []
    )
    response = client.post(
        "/trades",
        json={
            "account_id": account["id"],
            "instrument_id": desk.nq["id"],
            "setup_id": setup["id"] if setup else None,
            "direction": direction,
            "stop_price": "19995.00" if direction == "long" else "20005.00",
            "fills": [
                {"fill_type": "entry", "price": "20000.00", "quantity": "1", "filled_at": start.isoformat()},
                {
                    "fill_type": "exit",
                    "price": exit_price,
                    "quantity": "1",
                    "filled_at": (start + timedelta(minutes=5)).isoformat(),
                },
            ],
            "criteria_checks": checks,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.fixture
def book(client, desk):
    """Six trades in close order: +400, +200, -100, +100 on A, then -100, +300 on B."""
    return SimpleNamespace(
        t0=_trade(client, desk, desk.a, date(2026, 2, 10), "20020.00"),
        t1=_trade(client, desk, desk.a, date(2026, 9, 1), "20010.00", setup=desk.celup, checked=(0, 1)),
        t2=_trade(client, desk, desk.a, date(2026, 9, 2), "19995.00", setup=desk.celup),
        t3=_trade(client, desk, desk.a, date(2026, 9, 3), "20005.00", setup=desk.celup, checked=(0,)),
        t4=_trade(client, desk, desk.b, date(2026, 9, 4), "20005.00", direction="short", setup=desk.hulur),
        t5=_trade(client, desk, desk.b, date(2026, 9, 5), "20015.00", setup=desk.hulur, checked=(0,)),
    )


def _dash(client, **params):
    response = client.get("/dashboard", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _d(value):
    return None if value is None else Decimal(value)


def test_all_accounts_over_all_time(client, desk, book):
    dash = _dash(client)
    s = dash["summary"]

    assert dash["range"] == "ALL"
    assert dash["account"] == "all"
    assert _d(dash["starting_balance"]) == 15000
    assert (s["trade_count"], s["wins"], s["losses"], s["breakevens"]) == (6, 4, 2, 0)
    assert _d(s["net_pnl"]) == 800
    assert _d(s["gross_profits"]) == 1000
    assert _d(s["gross_losses"]) == 200
    assert _d(s["profit_factor"]) == Decimal("5.00")
    assert _d(s["win_rate"]) == Decimal("66.7")
    assert _d(s["expectancy"]) == Decimal("1.33")
    assert _d(s["total_r"]) == Decimal("8.00")
    assert _d(s["avg_execution_score"]) == Decimal("52.0")
    assert _d(s["return_pct"]) == Decimal("5.33")


def test_equity_curve_runs_from_the_baseline_in_close_order(client, desk, book):
    equity = _dash(client)["equity"]

    assert _d(equity["baseline"]) == 15000
    assert [_d(p["equity"]) for p in equity["points"]] == [15400, 15600, 15500, 15600, 15500, 15800]
    assert [p["trade_id"] for p in equity["points"]] == [book.t0, book.t1, book.t2, book.t3, book.t4, book.t5]
    assert [p["result"] for p in equity["points"]] == ["win", "win", "loss", "win", "loss", "win"]
    assert _d(equity["points"][2]["net_pnl"]) == -100
    assert _d(equity["peak"]) == 15800
    assert _d(equity["current"]) == 15800
    assert _d(equity["drawdown_amount"]) == 0
    assert _d(equity["drawdown_pct"]) == 0
    assert _d(equity["max_drawdown_pct"]) == Decimal("0.64")


def test_discipline_buckets_and_saved_capital(client, desk, book):
    discipline = _dash(client)["discipline"]
    by_band = {b["band"]: b for b in discipline["buckets"]}

    assert [b["band"] for b in discipline["buckets"]] == ["elite", "solid", "sub_optimal", "rule_breach"]
    assert (by_band["elite"]["trade_count"], _d(by_band["elite"]["net_pnl"])) == (2, 500)
    assert _d(by_band["elite"]["win_rate"]) == Decimal("100.0")
    assert _d(by_band["elite"]["avg_r"]) == Decimal("2.50")
    assert by_band["solid"]["trade_count"] == 0
    assert by_band["solid"]["win_rate"] is None
    assert (by_band["sub_optimal"]["trade_count"], _d(by_band["sub_optimal"]["net_pnl"])) == (1, 100)
    assert (by_band["rule_breach"]["trade_count"], _d(by_band["rule_breach"]["net_pnl"])) == (2, -200)
    assert _d(by_band["rule_breach"]["win_rate"]) == Decimal("0.0")
    assert _d(discipline["saved_capital"]) == 200


def test_setup_table_ranks_and_flags_small_samples(client, desk, book):
    setups = _dash(client)["setups"]

    assert [s["name"] for s in setups] == ["celup kaki", "hulur kepala"]
    celup, hulur = setups
    assert (celup["trade_count"], _d(celup["net_pnl"]), _d(celup["win_rate"])) == (3, 200, Decimal("66.7"))
    assert _d(celup["expectancy"]) == Decimal("0.67")
    assert _d(celup["avg_execution_score"]) == Decimal("53.3")
    assert (celup["rank"], celup["low_sample"]) == ("solid", True)
    assert (hulur["trade_count"], _d(hulur["expectancy"]), _d(hulur["avg_execution_score"])) == (
        2,
        Decimal("1.00"),
        Decimal("50.0"),
    )


def test_recent_trades_are_the_five_newest(client, desk, book):
    recent = _dash(client)["recent_trades"]

    assert [t["id"] for t in recent] == [book.t5, book.t4, book.t3, book.t2, book.t1]
    assert recent[0]["symbol"] == "NQ"
    assert recent[0]["setup"]["name"] == "hulur kepala"


def test_xp_level_and_streak_ignore_the_filters(client, desk, book):
    everything = _dash(client)["xp"]

    assert everything == {
        "total_xp": 260,
        "level": 1,
        "xp_in_level": 260,
        "xp_per_level": 10000,
        "win_streak": 1,
    }
    assert _dash(client, range="30D")["xp"] == everything
    assert _dash(client, account=desk.b["id"])["xp"] == everything


def test_one_account_uses_its_own_starting_balance_and_trades(client, desk, book):
    a = _dash(client, account=desk.a["id"])
    b = _dash(client, account=desk.b["id"])

    assert a["account"] == str(desk.a["id"])
    assert (_d(a["starting_balance"]), a["summary"]["trade_count"], _d(a["summary"]["net_pnl"])) == (10000, 4, 600)
    assert _d(a["summary"]["profit_factor"]) == Decimal("7.00")
    assert (_d(b["starting_balance"]), b["summary"]["trade_count"], _d(b["summary"]["net_pnl"])) == (5000, 2, 200)
    assert _d(b["summary"]["profit_factor"]) == Decimal("3.00")
    assert [t["id"] for t in b["recent_trades"]] == [book.t5, book.t4]


def test_all_accounts_equals_the_sum_of_the_accounts(client, desk, book):
    everything = _dash(client)
    a, b = _dash(client, account=desk.a["id"]), _dash(client, account=desk.b["id"])

    for field in ("trade_count", "wins", "losses", "net_pnl", "gross_pnl", "fees_total", "gross_profits", "gross_losses"):
        assert _d(everything["summary"][field]) == _d(a["summary"][field]) + _d(b["summary"][field]), field
    assert _d(everything["starting_balance"]) == _d(a["starting_balance"]) + _d(b["starting_balance"])
    assert _d(everything["equity"]["current"]) == _d(a["equity"]["current"]) + _d(b["equity"]["current"])
    assert everything["account"] == "all"
    assert _dash(client, account="ALL") == everything


def test_a_range_starts_the_curve_from_the_balance_at_that_point(client, desk, book):
    dash = _dash(client, range="30D")
    s = dash["summary"]

    assert dash["range"] == "30D"
    assert _d(dash["starting_balance"]) == 15000
    assert _d(dash["equity"]["baseline"]) == 15400
    assert [_d(p["equity"]) for p in dash["equity"]["points"]] == [15600, 15500, 15600, 15500, 15800]
    assert (s["trade_count"], _d(s["net_pnl"])) == (5, 400)
    assert _d(s["return_pct"]) == Decimal("2.60")
    assert _d(dash["equity"]["current"]) == 15800


def test_ytd_and_all_include_the_february_trade_but_recent_ranges_do_not(client, desk, book):
    assert _dash(client, range="YTD")["summary"]["trade_count"] == 6
    assert _dash(client, range="90D")["summary"]["trade_count"] == 5
    assert _dash(client, range="ALL")["summary"]["trade_count"] == 6


def test_an_account_without_trades_shows_its_balance_and_empty_stats(client, desk):
    dash = _dash(client, account=desk.a["id"])
    s = dash["summary"]

    assert s["trade_count"] == 0
    assert (s["win_rate"], s["profit_factor"], s["expectancy"], s["avg_execution_score"]) == (None, None, None, None)
    assert _d(s["net_pnl"]) == 0
    assert dash["equity"]["points"] == []
    assert (_d(dash["equity"]["baseline"]), _d(dash["equity"]["current"]), _d(dash["equity"]["peak"])) == (10000, 10000, 10000)
    assert [b["trade_count"] for b in dash["discipline"]["buckets"]] == [0, 0, 0, 0]
    assert _d(dash["discipline"]["saved_capital"]) == 0
    assert dash["setups"] == [] and dash["recent_trades"] == []
    assert dash["xp"] == {"total_xp": 0, "level": 1, "xp_in_level": 0, "xp_per_level": 10000, "win_streak": 0}


def test_a_user_with_no_accounts_gets_an_empty_dashboard(client):
    dash = _dash(client)

    assert _d(dash["starting_balance"]) == 0
    assert dash["summary"]["trade_count"] == 0
    assert dash["currency"] is None


def test_archived_accounts_still_count_toward_all(client, desk, book):
    client.post(f"/accounts/{desk.b['id']}/archive")

    assert _dash(client)["summary"]["trade_count"] == 6


def test_currency_is_shared_or_absent(client, desk):
    assert _dash(client)["currency"] == "USD"
    assert _dash(client, account=desk.a["id"])["currency"] == "USD"
    client.post("/accounts", json={"name": "EUR account", "starting_balance": "1", "currency": "EUR"})
    assert _dash(client)["currency"] is None


def test_other_users_data_never_leaks_in(client, other_client, desk, book):
    _dash_other = other_client.get("/dashboard").json()

    assert _dash_other["summary"]["trade_count"] == 0
    assert _d(_dash_other["starting_balance"]) == 0
    assert _dash_other["xp"]["total_xp"] == 0


@pytest.mark.parametrize("params", [{"range": "7D"}, {"account": "abc"}, {"account": "-1"}])
def test_bad_parameters_are_refused(client, desk, params):
    assert client.get("/dashboard", params=params).status_code == 422


def test_unknown_or_foreign_account_is_404(client, other_client, desk):
    assert client.get("/dashboard", params={"account": 9999}).status_code == 404
    assert other_client.get("/dashboard", params={"account": desk.a["id"]}).status_code == 404


def test_dashboard_needs_a_login(make_client):
    assert make_client().get("/dashboard").status_code == 401


def test_setup_rows_carry_the_current_subtitle(client, desk):
    subtitled = client.post(
        "/setups",
        json={"name": "FVG Retest", "subtitle": "Fair Value Gap (NQ / ES)", "criteria": [{"label": "Gap", "weight": "100"}]},
    ).json()
    _trade(client, desk, desk.a, date(2026, 9, 1), "20010.00", setup=subtitled, checked=(0,))
    _trade(client, desk, desk.a, date(2026, 9, 2), "20010.00", setup=desk.celup, checked=(0,))

    rows = {row["name"]: row for row in client.get("/dashboard").json()["setups"]}
    assert rows["FVG Retest"]["subtitle"] == "Fair Value Gap (NQ / ES)"
    assert rows["celup kaki"]["subtitle"] is None

    client.patch(f"/setups/{subtitled['id']}", json={"subtitle": "Renamed"})
    rows = {row["name"]: row for row in client.get("/dashboard").json()["setups"]}
    assert rows["FVG Retest"]["subtitle"] == "Renamed"
