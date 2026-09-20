from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import Trade, XpEvent
from tests.api.conftest import create_world, fill, trade71


def _post(client, body):
    return client.post("/trades", json=body)


def _created(client, body):
    response = _post(client, body)
    assert response.status_code == 201, response.text
    return response.json()


def _fee_lines(trade):
    return [(f["name"], Decimal(f["amount"])) for f in trade["fees"]]


def _xp_points(api_db):
    with api_db() as session:
        return [e.points for e in session.scalars(select(XpEvent).order_by(XpEvent.id))]


def test_trade_71_matches_the_mockup(client, world):
    trade = _created(client, trade71(world))

    assert Decimal(trade["quantity"]) == 2
    assert Decimal(trade["avg_entry"]) == Decimal("20379.00")
    assert Decimal(trade["avg_exit"]) == Decimal("20394.125")
    assert Decimal(trade["points"]) == Decimal("15.125")
    assert Decimal(trade["gross_pnl"]) == Decimal("605.00")
    assert Decimal(trade["risk_amount"]) == Decimal("250.00")
    assert Decimal(trade["fees_total"]) == Decimal("14.64")
    assert Decimal(trade["net_pnl"]) == Decimal("590.36")
    assert Decimal(trade["r_multiple"]) == Decimal("2.36")
    assert trade["execution_score"] == 85
    assert trade["score_band"] == "elite"


def test_fee_lines_are_snapshotted_from_the_account_tariff(client, world):
    trade = _created(client, trade71(world))

    assert _fee_lines(trade) == [
        ("Exchange fees", Decimal("6.40")),
        ("Broker commission", Decimal("8.00")),
        ("Regulatory fee", Decimal("0.24")),
    ]


def test_opened_and_closed_come_from_the_fills(client, world):
    trade = _created(client, trade71(world))

    assert datetime.fromisoformat(trade["opened_at"]) == datetime(2026, 9, 8, 9, 35, 12, tzinfo=timezone.utc)
    assert datetime.fromisoformat(trade["closed_at"]) == datetime(2026, 9, 8, 10, 14, 8, tzinfo=timezone.utc)


def test_saving_a_scored_trade_awards_xp_equal_to_the_score(client, world, api_db):
    _created(client, trade71(world))

    assert _xp_points(api_db) == [85]


def test_unchecked_and_omitted_criteria_are_stored_as_unchecked(client, world):
    body = trade71(world)
    body["criteria_checks"] = body["criteria_checks"][:2]

    trade = _created(client, body)

    assert [c["checked"] for c in trade["criteria"]] == [True, True, False, False, False]
    assert trade["execution_score"] == 50


def test_trade_without_a_setup_has_no_score_and_no_xp(client, world, api_db):
    body = trade71(world, setup_id=None, criteria_checks=[])

    trade = _created(client, body)

    assert trade["execution_score"] is None
    assert trade["score_band"] is None
    assert trade["setup"] is None
    assert _xp_points(api_db) == []


def test_setup_without_criteria_has_no_score(client, world):
    empty = client.post("/setups", json={"name": "untested idea"}).json()

    trade = _created(client, trade71(world, setup_id=empty["id"], criteria_checks=[]))

    assert trade["execution_score"] is None


def test_no_stop_means_no_risk_and_no_r_multiple(client, world):
    trade = _created(client, trade71(world, stop_price=None))

    assert trade["risk_amount"] is None
    assert trade["r_multiple"] is None
    assert Decimal(trade["net_pnl"]) == Decimal("590.36")


def test_short_loss(client, world):
    body = trade71(
        world,
        direction="short",
        stop_price="20010.00",
        setup_id=None,
        criteria_checks=[],
        fills=[
            fill("entry", "20000.00", "2", "2026-09-09T10:00:00Z"),
            fill("exit", "20010.00", "2", "2026-09-09T10:05:00Z"),
        ],
    )

    trade = _created(client, body)

    assert Decimal(trade["gross_pnl"]) == Decimal("-400.00")
    assert Decimal(trade["risk_amount"]) == Decimal("400.00")
    assert Decimal(trade["net_pnl"]) == Decimal("-407.32")
    assert Decimal(trade["r_multiple"]) == Decimal("-1.02")


def test_scale_in_then_one_exit_fill_counts_three_fills_for_per_fill_fees(client):
    world = create_world(client)
    one_line = client.post(
        "/fee-profiles",
        json={"name": "Exchange only", "components": [{"name": "Exchange fees", "amount": "1.60", "basis": "per_fill"}]},
    ).json()
    client.patch(f"/accounts/{world.account['id']}", json={"fee_profile_id": one_line["id"]})
    body = trade71(
        world,
        setup_id=None,
        criteria_checks=[],
        stop_price="19990.00",
        fills=[
            fill("entry", "20000.00", "1", "2026-09-09T10:00:00Z"),
            fill("entry", "20010.00", "1", "2026-09-09T10:01:00Z"),
            fill("exit", "20020.00", "2", "2026-09-09T10:10:00Z"),
        ],
    )

    trade = _created(client, body)

    assert Decimal(trade["avg_entry"]) == Decimal("20005")
    assert Decimal(trade["gross_pnl"]) == Decimal("600.00")
    assert _fee_lines(trade) == [("Exchange fees", Decimal("4.80"))]
    assert Decimal(trade["risk_amount"]) == Decimal("600.00")


def test_slippage_ticks_reduce_net_pnl(client, world):
    trade = _created(client, trade71(world, slippage_ticks="2"))

    assert Decimal(trade["slippage_ticks"]) == 2
    assert Decimal(trade["slippage_cost"]) == Decimal("20.00")
    assert Decimal(trade["net_pnl"]) == Decimal("570.36")


def test_fee_override_replaces_a_line_with_the_same_name_and_adds_new_ones(client, world):
    body = trade71(
        world,
        fees=[
            {"name": "exchange FEES", "amount": "10.00"},
            {"name": "Platform fee", "amount": "1.50"},
        ],
    )

    trade = _created(client, body)

    assert _fee_lines(trade) == [
        ("Exchange fees", Decimal("10.00")),
        ("Broker commission", Decimal("8.00")),
        ("Regulatory fee", Decimal("0.24")),
        ("Platform fee", Decimal("1.50")),
    ]
    assert Decimal(trade["fees_total"]) == Decimal("19.74")
    assert Decimal(trade["net_pnl"]) == Decimal("585.26")


def test_account_without_a_tariff_has_no_fee_lines(client, world):
    client.patch(f"/accounts/{world.account['id']}", json={"fee_profile_id": None})

    trade = _created(client, trade71(world))

    assert trade["fees"] == []
    assert Decimal(trade["net_pnl"]) == Decimal("605.00")


def test_derived_fields_from_the_client_are_refused(client, world):
    for field, value in [("net_pnl", "999"), ("execution_score", 100), ("opened_at", "2026-09-08T09:00:00Z")]:
        assert _post(client, trade71(world, **{field: value})).status_code == 422, field


def _bad_fills(*fills):
    return {"fills": list(fills)}


@pytest.mark.parametrize(
    "overrides",
    [
        _bad_fills(
            fill("entry", "100", "1", "2026-09-09T10:00:00Z"),
            fill("exit", "101", "1", "2026-09-09T09:59:59Z"),
        ),
        _bad_fills(
            fill("entry", "100", "0", "2026-09-09T10:00:00Z"),
            fill("exit", "101", "0", "2026-09-09T10:01:00Z"),
        ),
        _bad_fills(
            fill("entry", "100", "-1", "2026-09-09T10:00:00Z"),
            fill("exit", "101", "-1", "2026-09-09T10:01:00Z"),
        ),
        _bad_fills(
            fill("entry", "0", "1", "2026-09-09T10:00:00Z"),
            fill("exit", "101", "1", "2026-09-09T10:01:00Z"),
        ),
        _bad_fills(
            fill("entry", "100", "2", "2026-09-09T10:00:00Z"),
            fill("exit", "101", "1", "2026-09-09T10:01:00Z"),
        ),
        _bad_fills(fill("entry", "100", "1", "2026-09-09T10:00:00Z")),
        _bad_fills(fill("exit", "101", "1", "2026-09-09T10:01:00Z")),
        _bad_fills(),
        _bad_fills(
            fill("entry", "100", "1", "2026-09-09T10:00:00"),
            fill("exit", "101", "1", "2026-09-09T10:01:00"),
        ),
        _bad_fills(
            fill("hold", "100", "1", "2026-09-09T10:00:00Z"),
            fill("exit", "101", "1", "2026-09-09T10:01:00Z"),
        ),
        {"direction": "sideways"},
        {"stop_price": "0"},
        {"slippage_ticks": "-1"},
    ],
    ids=[
        "exit-before-entry",
        "zero-quantity",
        "negative-quantity",
        "zero-price",
        "quantities-differ",
        "no-exit",
        "no-entry",
        "no-fills",
        "naive-datetime",
        "unknown-fill-type",
        "bad-direction",
        "zero-stop",
        "negative-slippage",
    ],
)
def test_invalid_trades_are_refused(client, world, overrides):
    assert _post(client, trade71(world, **overrides)).status_code == 422


def test_criterion_from_another_setup_is_refused(client, world):
    other = client.post("/setups", json={"name": "hulur kepala", "criteria": [{"label": "x", "weight": "10"}]}).json()
    body = trade71(world)
    body["criteria_checks"][0]["criterion_id"] = other["criteria"][0]["id"]

    assert _post(client, body).status_code == 422


def test_checks_without_a_setup_are_refused(client, world):
    assert _post(client, trade71(world, setup_id=None)).status_code == 422


def test_the_same_criterion_twice_is_refused(client, world):
    body = trade71(world)
    body["criteria_checks"][1]["criterion_id"] = body["criteria_checks"][0]["criterion_id"]

    assert _post(client, body).status_code == 422


def test_references_to_missing_or_foreign_rows_are_refused(client, other_client, world):
    foreign = create_world(other_client)

    for field, value in [
        ("account_id", foreign.account["id"]),
        ("instrument_id", foreign.nq["id"]),
        ("setup_id", foreign.setup["id"]),
        ("account_id", 9999),
        ("instrument_id", 9999),
        ("setup_id", 9999),
    ]:
        body = trade71(world, **{field: value})
        if field == "setup_id":
            body["criteria_checks"] = []
        assert _post(client, body).status_code == 422, (field, value)


def test_screenshot_path_must_sit_in_the_users_own_folder(client, world):
    me = client.get("/auth/me").json()["id"]

    assert _post(client, trade71(world, screenshot_path=f"{me + 1}/x.png")).status_code == 422
    assert _post(client, trade71(world, screenshot_path=f"{me}/../{me + 1}/x.png")).status_code == 422
    assert _created(client, trade71(world, screenshot_path=f"{me}/x.png"))["screenshot_path"] == f"{me}/x.png"


def test_failed_validation_leaves_nothing_behind(client, world, api_db):
    _post(client, trade71(world, fills=[fill("entry", "100", "1", "2026-09-09T10:00:00Z")]))

    with api_db() as session:
        assert session.scalars(select(Trade)).all() == []
    assert _xp_points(api_db) == []


def test_trades_need_a_login(make_client):
    assert make_client().post("/trades", json={}).status_code == 401
