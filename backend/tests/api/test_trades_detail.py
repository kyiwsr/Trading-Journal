from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.models import Trade, XpEvent
from tests.api.conftest import create_world, fill, trade71


def _created(client, body):
    response = client.post("/trades", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def _xp_points(api_db):
    with api_db() as session:
        return [e.points for e in session.scalars(select(XpEvent).order_by(XpEvent.id))]


def _trade_count(api_db):
    with api_db() as session:
        return len(session.scalars(select(Trade)).all())


def _on_day(world, day, **overrides):
    """A two-fill trade closing on the given September 2026 day."""
    start = datetime(2026, 9, day, 10, 0, tzinfo=timezone.utc)
    fills = [
        fill("entry", "20000.00", "1", start.isoformat()),
        fill("exit", "20010.00", "1", (start + timedelta(minutes=5)).isoformat()),
    ]
    return trade71(world, setup_id=None, criteria_checks=[], stop_price=None, fills=fills, **overrides)


def test_detail_matches_what_creation_returned(client, world):
    created = _created(client, trade71(world))

    assert client.get(f"/trades/{created['id']}").json() == created


def test_exit_fills_carry_realized_points_and_pnl_against_the_average_entry(client, world):
    trade = _created(client, trade71(world))

    entries = [f for f in trade["fills"] if f["fill_type"] == "entry"]
    exits = [f for f in trade["fills"] if f["fill_type"] == "exit"]
    assert [(f["realized_points"], f["realized_pnl"]) for f in entries] == [(None, None), (None, None)]
    assert [(Decimal(f["realized_points"]), Decimal(f["realized_pnl"])) for f in exits] == [
        (Decimal("12.00"), Decimal("240.00")),
        (Decimal("18.25"), Decimal("365.00")),
    ]


def test_fills_are_listed_in_time_order_with_their_notes(client, world):
    trade = _created(client, trade71(world))

    assert [f["note"] for f in trade["fills"]] == ["Initial probe", "Retest double-down", "TP1, 50% banked", "Runner"]


def test_criteria_show_label_weight_and_the_notes_given(client, world):
    trade = _created(client, trade71(world))

    missed = [c for c in trade["criteria"] if not c["checked"]]
    assert len(trade["criteria"]) == 5
    assert [(c["label"], Decimal(c["weight"]), c["note"]) for c in missed] == [
        ("Wait for the 50% fibonacci retest", Decimal("15"), "Scale-in entered 3 ticks above the 50% level")
    ]


def test_detail_reports_xp_and_the_instrument(client, world):
    trade = _created(client, trade71(world))

    assert trade["xp_points"] == 85
    assert trade["instrument"]["symbol"] == "NQ"
    assert Decimal(trade["instrument"]["tick_value"]) == 5
    assert trade["setup"]["name"] == "celup kaki"


def test_neighbours_follow_close_time_not_creation_order(client, world):
    latest = _created(client, _on_day(world, 15))["id"]
    earliest = _created(client, _on_day(world, 9))["id"]
    middle = _created(client, _on_day(world, 12))["id"]

    assert client.get(f"/trades/{middle}").json()["prev_trade_id"] == earliest
    assert client.get(f"/trades/{middle}").json()["next_trade_id"] == latest
    assert client.get(f"/trades/{earliest}").json()["prev_trade_id"] is None
    assert client.get(f"/trades/{latest}").json()["next_trade_id"] is None


def test_neighbours_ignore_other_users_trades(client, other_client, world):
    mine = _created(client, _on_day(world, 9))["id"]
    _created(other_client, _on_day(create_world(other_client), 10))

    assert client.get(f"/trades/{mine}").json()["next_trade_id"] is None


def test_screenshot_url_comes_from_storage(client, world, fake_storage):
    me = client.get("/auth/me").json()["id"]
    trade = _created(client, trade71(world, screenshot_path=f"{me}/shot.png"))

    assert trade["screenshot_url"] == f"https://storage.test/read/{me}/shot.png"
    assert _created(client, _on_day(world, 9))["screenshot_url"] is None


def test_unknown_trade_is_404(client):
    assert client.get("/trades/9999").status_code == 404


def test_update_recomputes_everything(client, world):
    trade = _created(client, trade71(world))
    changed = trade71(
        world,
        fills=[
            fill("entry", "20000.00", "2", "2026-09-08T09:35:00Z"),
            fill("exit", "20010.00", "2", "2026-09-08T09:50:00Z"),
        ],
        stop_price="19990.00",
    )

    response = client.put(f"/trades/{trade['id']}", json=changed)

    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["id"] == trade["id"]
    assert Decimal(updated["gross_pnl"]) == Decimal("400.00")
    assert Decimal(updated["fees_total"]) == Decimal("7.32")
    assert Decimal(updated["net_pnl"]) == Decimal("392.68")
    assert Decimal(updated["r_multiple"]) == Decimal("0.98")
    assert len(updated["fills"]) == 2
    assert client.get(f"/trades/{trade['id']}").json() == updated


def test_update_replaces_the_checklist_and_the_xp_event(client, world, api_db):
    trade = _created(client, trade71(world))
    changed = trade71(world)
    for check in changed["criteria_checks"]:
        check["checked"] = True

    updated = client.put(f"/trades/{trade['id']}", json=changed).json()

    assert updated["execution_score"] == 100
    assert all(c["checked"] for c in updated["criteria"])
    assert _xp_points(api_db) == [100]


def test_update_to_no_setup_removes_the_xp_event(client, world, api_db):
    trade = _created(client, trade71(world))

    updated = client.put(f"/trades/{trade['id']}", json=trade71(world, setup_id=None, criteria_checks=[])).json()

    assert updated["execution_score"] is None
    assert updated["criteria"] == []
    assert _xp_points(api_db) == []


def test_invalid_update_changes_nothing(client, world):
    trade = _created(client, trade71(world))
    broken = trade71(world, fills=[fill("entry", "100", "1", "2026-09-08T09:35:00Z")])

    assert client.put(f"/trades/{trade['id']}", json=broken).status_code == 422
    assert client.get(f"/trades/{trade['id']}").json() == trade


def test_update_can_move_a_trade_to_another_own_account(client, world):
    trade = _created(client, trade71(world))
    second = client.post("/accounts", json={"name": "Second", "starting_balance": "5000"}).json()

    updated = client.put(f"/trades/{trade['id']}", json=trade71(world, account_id=second["id"])).json()

    assert updated["account_id"] == second["id"]
    assert updated["fees"] == []


def test_delete_removes_the_trade_and_its_xp(client, world, api_db):
    trade = _created(client, trade71(world))

    assert client.delete(f"/trades/{trade['id']}").status_code == 204

    assert client.get(f"/trades/{trade['id']}").status_code == 404
    assert _xp_points(api_db) == []
    assert _trade_count(api_db) == 0


def test_other_users_cannot_read_change_or_delete_a_trade(client, other_client, world):
    trade = _created(client, trade71(world))
    url = f"/trades/{trade['id']}"

    assert other_client.get(url).status_code == 404
    assert other_client.put(url, json=trade71(world)).status_code == 404
    assert other_client.delete(url).status_code == 404
    assert client.get(url).json() == trade


def test_detail_names_the_accounts_current_fee_profile(client, world):
    created = _created(client, trade71(world))
    assert created["fee_profile_name"] == "Example prop tariff"

    client.patch(f"/fee-profiles/{world.profile['id']}", json={"name": "Renamed tariff"})
    assert client.get(f"/trades/{created['id']}").json()["fee_profile_name"] == "Renamed tariff"


def test_detail_has_no_fee_profile_name_when_the_account_has_none(client, world):
    bare = client.post("/accounts", json={"name": "No tariff", "starting_balance": "5000"}).json()

    created = _created(client, trade71(world, account_id=bare["id"]))

    assert created["fee_profile_name"] is None
    assert created["fees"] == []
