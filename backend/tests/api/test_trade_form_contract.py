from decimal import Decimal

from sqlalchemy import select

from app.models import XpEvent
from tests.api.conftest import TARIFF, trade71


def _put_body(detail):
    """What an edit form sends back after loading GET /trades/{id} and changing nothing."""
    return {
        "account_id": detail["account_id"],
        "instrument_id": detail["instrument"]["id"],
        "setup_id": detail["setup"]["id"] if detail["setup"] else None,
        "direction": detail["direction"],
        "session": detail["session"],
        "tags": detail["tags"],
        "stop_price": detail["stop_price"],
        "target_price": detail["target_price"],
        "fills": [{k: f[k] for k in ("fill_type", "price", "quantity", "filled_at", "note")} for f in detail["fills"]],
        "criteria_checks": [
            {"criterion_id": c["criterion_id"], "checked": c["checked"], "note": c["note"]} for c in detail["criteria"]
        ],
        "fees": [{"name": f["name"], "amount": f["amount"]} for f in detail["fees"]],
        "pre_trade_focus": detail["pre_trade_focus"],
        "environment": detail["environment"],
        "debrief_notes": detail["debrief_notes"],
        "screenshot_path": detail["screenshot_path"],
    }


def _without_fill_ids(detail):
    return {**detail, "fills": [{k: v for k, v in f.items() if k != "id"} for f in detail["fills"]]}


def _created(client, world):
    response = client.post("/trades", json=trade71(world))
    assert response.status_code == 201, response.text
    return response.json()


def test_a_loaded_trade_can_be_saved_back_unchanged(client, world, api_db):
    before = _created(client, world)

    response = client.put(f"/trades/{before['id']}", json=_put_body(before))

    assert response.status_code == 200, response.text
    assert _without_fill_ids(response.json()) == _without_fill_ids(before)
    with api_db() as session:
        assert [e.points for e in session.scalars(select(XpEvent))] == [85]


def test_resending_the_stored_fees_keeps_history_when_the_tariff_changes(client, world):
    before = _created(client, world)
    repriced = [{**c, "amount": "5.00"} if c["name"] == "Exchange fees" else c for c in TARIFF["components"]]
    client.patch(f"/fee-profiles/{world.profile['id']}", json={"components": repriced})

    kept = client.put(f"/trades/{before['id']}", json=_put_body(before)).json()
    assert Decimal(kept["fees_total"]) == Decimal("14.64")
    assert kept["fees"] == before["fees"]

    body = _put_body(before)
    del body["fees"]
    refreshed = client.put(f"/trades/{before['id']}", json=body).json()
    assert Decimal(refreshed["fees_total"]) == Decimal("28.24")


def test_the_read_endpoints_hold_everything_a_new_trade_form_needs(client, world):
    archived = client.post("/instruments", json={"symbol": "OLD", "tick_size": "1", "tick_value": "1"}).json()
    client.post(f"/instruments/{archived['id']}/archive")

    instruments = client.get("/instruments").json()
    assert [(i["symbol"], i["tick_size"], i["tick_value"]) for i in instruments] == [("NQ", "0.25000000", "5.00000000")]

    setups = client.get("/setups").json()
    criteria = setups[0]["criteria"]
    assert [c["display_order"] for c in criteria] == sorted(c["display_order"] for c in criteria)
    assert [Decimal(c["weight"]) for c in criteria] == [25, 25, 20, 15, 15]
    assert all({"id", "label", "weight", "display_order"} <= c.keys() for c in criteria)

    account = client.get("/accounts").json()[0]
    profile = client.get(f"/fee-profiles/{account['fee_profile_id']}").json()
    assert [(c["name"], Decimal(c["amount"]), c["basis"]) for c in profile["components"]] == [
        ("Exchange fees", Decimal("1.60"), "per_fill"),
        ("Broker commission", Decimal("2.00"), "per_fill"),
        ("Regulatory fee", Decimal("0.06"), "per_fill"),
    ]


def test_an_archived_setup_and_account_drop_out_of_the_default_lists(client, world):
    client.post(f"/setups/{world.setup['id']}/archive")
    client.post(f"/accounts/{world.account['id']}/archive")

    assert client.get("/setups").json() == []
    assert client.get("/accounts").json() == []
    assert len(client.get("/setups", params={"include_archived": True}).json()) == 1
