from decimal import Decimal

SETUP = {
    "name": "celup kaki",
    "subtitle": "Liquidity Sweep Scalp",
    "description": "Sweep, displacement, retest.",
    "criteria": [
        {"label": "Liquidity sweep confirmed", "weight": "25"},
        {"label": "Market structure shift with displacement", "weight": "25"},
        {"label": "Stop placed before entry", "weight": "20"},
    ],
}


def _create(client, **overrides):
    response = client.post("/setups", json={**SETUP, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def _put(client, setup_id, items):
    return client.put(f"/setups/{setup_id}/criteria", json=items)


def _labels(setup):
    return [c["label"] for c in setup["criteria"]]


def _account_and_instrument(client):
    account = client.post("/accounts", json={"name": "A", "starting_balance": "1000"}).json()
    instrument = client.post("/instruments", json={"symbol": "NQ", "tick_size": "0.25", "tick_value": "5"}).json()
    return account, instrument


def test_create_keeps_criteria_in_the_order_given(client):
    setup = _create(client)

    assert setup["name"] == "celup kaki"
    assert setup["subtitle"] == "Liquidity Sweep Scalp"
    assert _labels(setup) == [c["label"] for c in SETUP["criteria"]]
    assert [c["display_order"] for c in setup["criteria"]] == [0, 1, 2]
    assert [Decimal(c["weight"]) for c in setup["criteria"]] == [Decimal(25), Decimal(25), Decimal(20)]


def test_create_without_criteria_is_allowed(client):
    assert _create(client, criteria=[])["criteria"] == []


def test_get_and_list(client):
    setup = _create(client)
    assert client.get(f"/setups/{setup['id']}").json() == setup
    assert client.get("/setups").json() == [setup]


def test_create_validates_input(client):
    assert client.post("/setups", json={**SETUP, "name": " "}).status_code == 422
    assert client.post("/setups", json={**SETUP, "criteria": [{"label": "x", "weight": "0"}]}).status_code == 422
    assert client.post("/setups", json={**SETUP, "criteria": [{"label": "x", "weight": "-3"}]}).status_code == 422
    assert client.post("/setups", json={**SETUP, "criteria": [{"label": " ", "weight": "5"}]}).status_code == 422


def test_update_changes_details_but_not_criteria(client):
    setup = _create(client)

    updated = client.patch(f"/setups/{setup['id']}", json={"name": "celup kaki v2", "subtitle": None}).json()

    assert updated["name"] == "celup kaki v2"
    assert updated["subtitle"] is None
    assert updated["description"] == "Sweep, displacement, retest."
    assert updated["criteria"] == setup["criteria"]


def test_update_rejects_null_name(client):
    setup = _create(client)
    assert client.patch(f"/setups/{setup['id']}", json={"name": None}).status_code == 422


def test_reordering_criteria_persists_and_keeps_ids(client):
    setup = _create(client)
    a, b, c = setup["criteria"]

    response = _put(client, setup["id"], [
        {"id": c["id"], "label": c["label"], "weight": c["weight"]},
        {"id": a["id"], "label": a["label"], "weight": a["weight"]},
        {"id": b["id"], "label": b["label"], "weight": b["weight"]},
    ])

    assert response.status_code == 200
    reordered = client.get(f"/setups/{setup['id']}").json()
    assert [x["id"] for x in reordered["criteria"]] == [c["id"], a["id"], b["id"]]
    assert [x["display_order"] for x in reordered["criteria"]] == [0, 1, 2]
    assert response.json() == reordered


def test_criteria_can_be_edited_added_and_removed_in_one_call(client):
    setup = _create(client)
    a, b, _ = setup["criteria"]

    result = _put(client, setup["id"], [
        {"id": a["id"], "label": "Sweep confirmed below the London low", "weight": "30"},
        {"label": "Wait for the 50% retest", "weight": "15"},
        {"id": b["id"], "label": b["label"], "weight": b["weight"]},
    ]).json()

    assert _labels(result) == ["Sweep confirmed below the London low", "Wait for the 50% retest", b["label"]]
    assert result["criteria"][0]["id"] == a["id"]
    assert Decimal(result["criteria"][0]["weight"]) == Decimal(30)
    assert result["criteria"][1]["id"] not in {a["id"], b["id"], setup["criteria"][2]["id"]}
    assert len(result["criteria"]) == 3


def test_omitting_a_criterion_removes_it(client):
    setup = _create(client)
    keep = setup["criteria"][0]

    result = _put(client, setup["id"], [{"id": keep["id"], "label": keep["label"], "weight": keep["weight"]}]).json()

    assert [c["id"] for c in result["criteria"]] == [keep["id"]]


def test_empty_list_clears_criteria(client):
    setup = _create(client)
    assert _put(client, setup["id"], []).json()["criteria"] == []


def test_criteria_validation(client):
    setup = _create(client)
    keep = setup["criteria"][0]

    assert _put(client, setup["id"], [{"label": "x", "weight": "0"}]).status_code == 422
    assert _put(client, setup["id"], [{"label": "", "weight": "5"}]).status_code == 422
    unknown = _put(client, setup["id"], [{"id": 9999, "label": "x", "weight": "5"}])
    assert unknown.status_code == 422
    duplicate = _put(client, setup["id"], [
        {"id": keep["id"], "label": "a", "weight": "5"},
        {"id": keep["id"], "label": "b", "weight": "5"},
    ])
    assert duplicate.status_code == 422
    assert client.get(f"/setups/{setup['id']}").json() == setup


def test_a_criterion_from_another_setup_cannot_be_adopted(client):
    first = _create(client)
    second = _create(client, name="hulur kepala")
    stolen = second["criteria"][0]

    response = _put(client, first["id"], [{"id": stolen["id"], "label": "x", "weight": "5"}])

    assert response.status_code == 422
    assert client.get(f"/setups/{second['id']}").json() == second


def test_criterion_used_by_a_trade_cannot_be_removed(client, add_trade, add_check):
    setup = _create(client)
    account, instrument = _account_and_instrument(client)
    trade_id = add_trade(account["id"], instrument["id"], setup["id"])
    used, other, third = setup["criteria"]
    add_check(trade_id, used["id"])

    response = _put(client, setup["id"], [
        {"id": other["id"], "label": other["label"], "weight": other["weight"]},
        {"id": third["id"], "label": third["label"], "weight": third["weight"]},
    ])

    assert response.status_code == 409
    assert client.get(f"/setups/{setup['id']}").json() == setup


def test_a_used_criterion_can_still_be_edited_and_reordered(client, add_trade, add_check):
    setup = _create(client)
    account, instrument = _account_and_instrument(client)
    trade_id = add_trade(account["id"], instrument["id"], setup["id"])
    first, second, third = setup["criteria"]
    add_check(trade_id, first["id"])

    response = _put(client, setup["id"], [
        {"id": second["id"], "label": second["label"], "weight": second["weight"]},
        {"id": first["id"], "label": "Reworded", "weight": "10"},
        {"id": third["id"], "label": third["label"], "weight": third["weight"]},
    ])

    assert response.status_code == 200
    assert response.json()["criteria"][1]["label"] == "Reworded"


def test_archive_and_unarchive(client):
    setup = _create(client)

    assert client.post(f"/setups/{setup['id']}/archive").json()["archived_at"] is not None
    assert client.get("/setups").json() == []
    assert [s["id"] for s in client.get("/setups?include_archived=true").json()] == [setup["id"]]
    assert client.post(f"/setups/{setup['id']}/unarchive").json()["archived_at"] is None
    assert len(client.get("/setups").json()) == 1


def test_unused_setup_can_be_deleted(client):
    setup = _create(client)

    assert client.delete(f"/setups/{setup['id']}").status_code == 204
    assert client.get(f"/setups/{setup['id']}").status_code == 404


def test_used_setup_cannot_be_deleted_but_can_be_archived(client, add_trade):
    setup = _create(client)
    account, instrument = _account_and_instrument(client)
    add_trade(account["id"], instrument["id"], setup["id"])

    response = client.delete(f"/setups/{setup['id']}")

    assert response.status_code == 409
    assert "archive" in response.json()["detail"].lower()
    assert client.get(f"/setups/{setup['id']}").status_code == 200
    assert client.post(f"/setups/{setup['id']}/archive").status_code == 200


def test_unknown_setup_is_404(client):
    assert client.get("/setups/9999").status_code == 404
    assert _put(client, 9999, []).status_code == 404


def test_other_users_cannot_see_or_change_a_setup(client, other_client):
    setup = _create(client)
    url = f"/setups/{setup['id']}"

    assert other_client.get("/setups").json() == []
    assert other_client.get(url).status_code == 404
    assert other_client.patch(url, json={"name": "Hijacked"}).status_code == 404
    assert _put(other_client, setup["id"], []).status_code == 404
    assert other_client.post(f"{url}/archive").status_code == 404
    assert other_client.post(f"{url}/unarchive").status_code == 404
    assert other_client.delete(url).status_code == 404
    assert client.get(url).json() == setup
