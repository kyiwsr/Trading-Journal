from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from tests.api.conftest import create_world, fill, trade71

# NQ pays $20 a point per contract and the tariff costs 1.60 + 2.00 + 0.06 = 3.66 a fill, so a 1-lot round trip costs 7.32.
FEES = Decimal("7.32")


def _trade(client, world, day, *, exit_price, direction="long", account=None, setup=None, all_checked=False):
    checks = [{"criterion_id": c["id"], "checked": True} for c in setup["criteria"]] if setup and all_checked else []
    start = datetime(2026, 9, day, 10, 0, tzinfo=timezone.utc)
    body = trade71(
        world,
        account_id=(account or world.account)["id"],
        setup_id=setup["id"] if setup else None,
        direction=direction,
        stop_price=None,
        criteria_checks=checks,
        tags=[],
        fills=[
            fill("entry", "20000.00", "1", start.isoformat()),
            fill("exit", exit_price, "1", (start + timedelta(minutes=5)).isoformat()),
        ],
    )
    response = client.post("/trades", json=body)
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.fixture
def ledger(client):
    """Five trades: 192.68 win (score 100), -207.32 loss (score 0), 32.68 win, 0 flat, 200 win."""
    world = create_world(client)
    second = client.post("/accounts", json={"name": "Second", "starting_balance": "5000"}).json()
    _trade(client, world, 1, exit_price="20010.00", setup=world.setup, all_checked=True)
    _trade(client, world, 2, exit_price="20010.00", direction="short", setup=world.setup)
    _trade(client, world, 3, exit_price="20002.00")
    _trade(client, world, 5, exit_price="20000.00", account=second)
    _trade(client, world, 6, exit_price="19990.00", direction="short", account=second)
    return SimpleNamespace(world=world, second=second)


def _summary(client, **params):
    response = client.get("/trades", params=params)
    assert response.status_code == 200, response.text
    return response.json()["summary"]


def _money(summary, key):
    return Decimal(summary[key])


def test_summary_covers_every_trade(client, ledger):
    s = _summary(client)

    assert (s["trades"], s["wins"], s["losses"], s["breakeven"]) == (5, 3, 1, 1)
    assert (_money(s, "net_pnl"), _money(s, "fees_total")) == (Decimal("218.04"), FEES * 3)
    assert (Decimal(s["win_rate"]), Decimal(s["profit_factor"])) == (Decimal("60.0"), Decimal("2.05"))
    assert Decimal(s["avg_score"]) == Decimal("50.0")
    assert (s["scored_count"], s["compliant_count"], s["elite_count"], s["avg_hold_seconds"]) == (2, 1, 1, 300)


def test_summary_ignores_paging(client, ledger):
    page = client.get("/trades", params={"page": 2, "page_size": 1}).json()

    assert len(page["items"]) == 1
    assert page["summary"]["trades"] == 5
    assert page["total"] == 5


def test_summary_follows_the_same_filters_as_the_list(client, ledger):
    apex = _summary(client, account=ledger.world.account["id"])
    assert (apex["trades"], apex["wins"], apex["losses"], apex["breakeven"]) == (3, 2, 1, 0)
    assert (_money(apex, "net_pnl"), Decimal(apex["win_rate"]), Decimal(apex["profit_factor"])) == (
        Decimal("18.04"),
        Decimal("66.7"),
        Decimal("1.09"),
    )

    kaki = _summary(client, setup=ledger.world.setup["id"])
    assert (kaki["trades"], kaki["scored_count"], Decimal(kaki["avg_score"])) == (2, 2, Decimal("50.0"))

    from_third = _summary(client, date_from="2026-09-03")
    assert (from_third["trades"], _money(from_third, "net_pnl")) == (3, Decimal("232.68"))

    wins = _summary(client, result="win")
    assert (wins["trades"], wins["losses"], wins["profit_factor"], Decimal(wins["win_rate"])) == (
        3,
        0,
        None,
        Decimal("100.0"),
    )


def test_summary_of_an_empty_result_has_no_rates(client, ledger):
    s = _summary(client, q="matches nothing")

    assert (s["trades"], s["wins"], s["losses"], s["breakeven"]) == (0, 0, 0, 0)
    assert (_money(s, "net_pnl"), _money(s, "fees_total")) == (Decimal(0), Decimal(0))
    assert (s["win_rate"], s["profit_factor"], s["avg_score"], s["avg_hold_seconds"]) == (None, None, None, None)
    assert (s["scored_count"], s["compliant_count"], s["elite_count"]) == (0, 0, 0)


def test_compliant_count_follows_the_cutoff_and_elite_count_does_not(client, ledger):
    client.put("/settings", json={"compliance_cutoff": 0})
    loose = _summary(client)
    client.put("/settings", json={"compliance_cutoff": 100})
    strict = _summary(client)

    assert (loose["compliant_count"], loose["elite_count"]) == (2, 1)
    assert (strict["compliant_count"], strict["elite_count"]) == (1, 1)


def test_summary_never_counts_another_users_trades(client, other_client, ledger):
    assert _summary(other_client)["trades"] == 0

    other_world = create_world(other_client)
    _trade(other_client, other_world, 8, exit_price="20010.00")

    assert _summary(client)["trades"] == 5
    assert _summary(other_client)["trades"] == 1


def test_dashboard_recent_trades_are_unaffected(client, ledger):
    assert len(client.get("/dashboard").json()["recent_trades"]) == 5
