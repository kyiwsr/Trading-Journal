import csv
import io
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from tests.api.conftest import create_world, fill, trade71

TODAY = date(2026, 9, 20)


@pytest.fixture(autouse=True)
def fixed_today(client):
    from app.main import app
    from app.trade_queries import get_today

    app.dependency_overrides[get_today] = lambda: TODAY


def _trade(
    client, world, when, *, exit_price, direction="long", instrument=None, setup=None, account=None, all_checked=False, **extra
):
    """One 1-lot trade opened at 10:00 UTC on `when`, entering at 20000 and closing five minutes later."""
    checks = [{"criterion_id": c["id"], "checked": True} for c in setup["criteria"]] if setup and all_checked else []
    start = datetime(when.year, when.month, when.day, 10, 0, tzinfo=timezone.utc)
    body = trade71(
        world,
        account_id=(account or world.account)["id"],
        instrument_id=(instrument or world.nq)["id"],
        setup_id=setup["id"] if setup else None,
        direction=direction,
        stop_price=None,
        criteria_checks=checks,
        tags=extra.pop("tags", []),
        fills=[
            fill("entry", "20000.00", "1", start.isoformat()),
            fill("exit", exit_price, "1", (start + timedelta(minutes=5)).isoformat()),
        ],
        **extra,
    )
    response = client.post("/trades", json=body)
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.fixture
def ledger(client, world):
    es = client.post("/instruments", json={"symbol": "ES", "tick_size": "0.25", "tick_value": "12.5"}).json()
    hulur = client.post(
        "/setups", json={"name": "hulur kepala", "criteria": [{"label": "Opening range marked", "weight": "10"}]}
    ).json()
    no_fees = client.post("/accounts", json={"name": "Second", "starting_balance": "5000"}).json()
    kaki = world.setup

    ids = SimpleNamespace(
        old=_trade(client, world, date(2026, 2, 10), exit_price="20010.00", tags=["old"]),
        win_kaki=_trade(client, world, date(2026, 9, 1), exit_price="20010.00", setup=kaki, all_checked=True,
                        tags=["london"], debrief_notes="Clean sweep and retest"),
        loss_kaki=_trade(client, world, date(2026, 9, 2), exit_price="20010.00", direction="short", setup=kaki,
                         tags=["fomc"]),
        win_hulur_es=_trade(client, world, date(2026, 9, 3), exit_price="20008.00", instrument=es, setup=hulur),
        win_plain=_trade(client, world, date(2026, 9, 4), exit_price="20002.00"),
        flat_second=_trade(client, world, date(2026, 9, 5), exit_price="20000.00", account=no_fees),
        win_second=_trade(client, world, date(2026, 9, 6), exit_price="19990.00", direction="short", account=no_fees,
                          tags=["Runner", "50%_target"]),
    )
    return SimpleNamespace(ids=ids, es=es, hulur=hulur, kaki=kaki, second=no_fees)


def _list(client, **params):
    response = client.get("/trades", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _ids(page):
    return [item["id"] for item in page["items"]]


def test_default_order_is_newest_close_first_with_a_total(client, ledger):
    page = _list(client)
    i = ledger.ids

    assert page["total"] == 7
    assert page["page"] == 1
    assert _ids(page) == [i.win_second, i.flat_second, i.win_plain, i.win_hulur_es, i.loss_kaki, i.win_kaki, i.old]


def test_items_carry_what_the_ledger_table_shows(client, ledger):
    item = _list(client, setup=ledger.kaki["id"], result="win")["items"][0]

    assert item["symbol"] == "NQ"
    assert item["instrument_name"] is None
    assert item["direction"] == "long"
    assert item["setup"] == {"id": ledger.kaki["id"], "name": "celup kaki", "subtitle": "Liquidity Sweep Scalp"}
    assert (item["entry_fills"], item["exit_fills"]) == (1, 1)
    assert Decimal(item["quantity"]) == 1
    assert Decimal(item["gross_pnl"]) == Decimal("200.00")
    assert Decimal(item["fees_total"]) == Decimal("7.32")
    assert Decimal(item["net_pnl"]) == Decimal("192.68")
    assert item["result"] == "win"
    assert item["tags"] == ["london"]
    assert item["session"] == "NY open"
    assert item["has_screenshot"] is False
    assert item["execution_score"] == 100
    assert item["score_band"] == "elite"


def test_pagination(client, ledger):
    first = _list(client, page_size=3)
    second = _list(client, page_size=3, page=2)
    last = _list(client, page_size=3, page=3)

    assert (len(first["items"]), len(second["items"]), len(last["items"])) == (3, 3, 1)
    assert first["total"] == second["total"] == last["total"] == 7
    assert set(_ids(first)) | set(_ids(second)) | set(_ids(last)) == {i["id"] for i in _list(client)["items"]}
    assert _list(client, page=9)["items"] == []


def test_filter_by_account(client, ledger, world):
    assert _list(client, account=ledger.second["id"])["total"] == 2
    assert _list(client, account=world.account["id"])["total"] == 5
    assert _list(client, account="all")["total"] == 7


def test_filter_by_setup_side_and_result(client, ledger):
    i = ledger.ids

    assert _ids(_list(client, setup=ledger.kaki["id"])) == [i.loss_kaki, i.win_kaki]
    assert _ids(_list(client, side="short")) == [i.win_second, i.loss_kaki]
    assert _ids(_list(client, result="loss")) == [i.loss_kaki]
    assert _ids(_list(client, result="breakeven")) == [i.flat_second]
    assert len(_list(client, result="win")["items"]) == 5


def test_filters_combine(client, ledger):
    i = ledger.ids

    assert _ids(_list(client, side="short", result="win")) == [i.win_second]
    assert _ids(_list(client, account=ledger.second["id"], result="win")) == [i.win_second]
    assert _ids(_list(client, setup=ledger.kaki["id"], side="long", date_from="2026-09-01")) == [i.win_kaki]


def test_date_bounds_are_inclusive_days(client, ledger):
    i = ledger.ids

    assert _ids(_list(client, date_from="2026-09-02", date_to="2026-09-04")) == [i.win_plain, i.win_hulur_es, i.loss_kaki]
    assert _ids(_list(client, date_to="2026-02-10")) == [i.old]


def test_range_presets_count_back_from_today(client, ledger):
    assert _list(client, range="30D")["total"] == 6
    assert _list(client, range="90D")["total"] == 6
    assert _list(client, range="YTD")["total"] == 7
    assert _list(client, range="ALL")["total"] == 7


def test_explicit_date_from_overrides_a_range_preset(client, ledger):
    assert _list(client, range="30D", date_from="2026-09-05")["total"] == 2


def test_text_search_covers_symbol_setup_tags_and_notes(client, ledger):
    i = ledger.ids

    assert i.win_hulur_es not in _ids(_list(client, q="nq"))
    assert _list(client, q="nq")["total"] == 6
    assert _ids(_list(client, q="HULUR")) == [i.win_hulur_es]
    assert _ids(_list(client, q="fomc")) == [i.loss_kaki]
    assert _ids(_list(client, q="retest")) == [i.win_kaki]
    assert _ids(_list(client, q="runner")) == [i.win_second]


def test_search_treats_wildcards_literally(client, ledger):
    assert _list(client, q="%")["total"] == 1
    assert _list(client, q="_")["total"] == 1
    assert _list(client, q="100%")["total"] == 0


def test_sort_by_net_pnl_both_ways_with_id_as_tie_break(client, ledger):
    i = ledger.ids

    assert _ids(_list(client, sort_by="net_pnl", order="desc")) == [
        i.win_hulur_es, i.win_second, i.win_kaki, i.old, i.win_plain, i.flat_second, i.loss_kaki,
    ]
    assert _ids(_list(client, sort_by="net_pnl", order="asc")) == [
        i.loss_kaki, i.flat_second, i.win_plain, i.old, i.win_kaki, i.win_second, i.win_hulur_es,
    ]


def test_sort_puts_missing_scores_last_either_way(client, ledger):
    asc = [item["execution_score"] for item in _list(client, sort_by="execution_score", order="asc")["items"]]
    desc = [item["execution_score"] for item in _list(client, sort_by="execution_score", order="desc")["items"]]

    assert asc == [0, 0, 100, None, None, None, None]
    assert desc == [100, 0, 0, None, None, None, None]


def test_sort_by_open_time(client, ledger):
    i = ledger.ids

    assert _ids(_list(client, sort_by="opened_at", order="asc"))[:2] == [i.old, i.win_kaki]


def test_other_users_trades_are_never_listed(client, other_client, ledger):
    mine = _list(client)["total"]
    theirs = _trade(other_client, create_world(other_client), date(2026, 9, 7), exit_price="20010.00")

    assert _list(client)["total"] == mine
    assert theirs not in _ids(_list(client))
    assert _ids(_list(other_client)) == [theirs]


@pytest.mark.parametrize(
    "params",
    [
        {"side": "sideways"},
        {"result": "draw"},
        {"range": "7D"},
        {"page": 0},
        {"page_size": 0},
        {"page_size": 201},
        {"sort_by": "bogus"},
        {"order": "up"},
        {"account": "abc"},
        {"date_from": "not-a-date"},
    ],
)
def test_bad_parameters_are_refused(client, ledger, params):
    assert client.get("/trades", params=params).status_code == 422


def test_unknown_or_foreign_account_is_404(client, other_client, ledger):
    other_account = create_world(other_client).account

    assert client.get("/trades", params={"account": 9999}).status_code == 404
    assert client.get("/trades", params={"account": other_account["id"]}).status_code == 404


def test_listing_needs_a_login(make_client):
    assert make_client().get("/trades").status_code == 401


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


def _export(client, **params):
    response = client.get("/trades/export.csv", params=params)
    assert response.status_code == 200, response.text
    return response, list(csv.DictReader(io.StringIO(response.text)))


def test_export_is_a_csv_download_with_the_ledger_columns(client, ledger):
    response, rows = _export(client)

    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    assert list(rows[0].keys()) == CSV_COLUMNS
    assert len(rows) == 7


def test_export_applies_the_same_filters_and_ignores_paging(client, ledger):
    _, rows = _export(client, result="win", page_size=1)

    assert len(rows) == 5
    assert {r["result"] for r in rows} == {"win"}


def test_export_row_matches_the_trade(client, ledger):
    _, rows = _export(client, setup=ledger.kaki["id"], result="win")

    row = rows[0]
    assert (row["symbol"], row["side"], row["setup"], row["account"]) == ("NQ", "long", "celup kaki", "Apex 150k")
    assert (row["entry_fills"], row["exit_fills"], Decimal(row["quantity"])) == ("1", "1", 1)
    assert Decimal(row["net_pnl"]) == Decimal("192.68")
    assert row["closed_at"].startswith("2026-09-01T10:05:00")
    assert row["tags"] == "london"


def test_export_joins_tags_and_keeps_awkward_text_intact(client, ledger):
    _, rows = _export(client, account=ledger.second["id"], result="win")

    assert rows[0]["tags"] == "Runner; 50%_target"


def test_export_neutralises_spreadsheet_formulas_in_text_cells(client, world):
    formula = client.post("/setups", json={"name": "=HYPERLINK(\"http://x\")"}).json()
    _trade(client, world, date(2026, 9, 1), exit_price="20010.00", setup=formula, tags=["@sum", "-1"])

    _, rows = _export(client)

    assert rows[0]["setup"] == "'=HYPERLINK(\"http://x\")"
    assert rows[0]["tags"] == "'@sum; '-1"
    assert Decimal(rows[0]["net_pnl"]) > 0


def test_export_needs_a_login(make_client):
    assert make_client().get("/trades/export.csv").status_code == 401
