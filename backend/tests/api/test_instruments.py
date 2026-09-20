from decimal import Decimal

NQ = {"symbol": "NQ", "name": "E-mini Nasdaq", "tick_size": "0.25", "tick_value": "5.00"}


def _create(client, **overrides):
    response = client.post("/instruments", json={**NQ, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def test_create_uppercases_the_symbol_and_keeps_tick_precision(client):
    instrument = _create(client, symbol=" nq ")

    assert instrument["symbol"] == "NQ"
    assert Decimal(instrument["tick_size"]) == Decimal("0.25")
    assert Decimal(instrument["tick_value"]) == Decimal("5")


def test_forex_style_tick_sizes_are_supported(client):
    instrument = _create(client, symbol="EURUSD", tick_size="0.00001", tick_value="1")
    assert Decimal(instrument["tick_size"]) == Decimal("0.00001")


def test_get_list_and_update(client):
    instrument = _create(client)

    assert client.get(f"/instruments/{instrument['id']}").json() == instrument
    assert client.get("/instruments").json() == [instrument]

    updated = client.patch(f"/instruments/{instrument['id']}", json={"tick_value": "20", "name": None}).json()
    assert Decimal(updated["tick_value"]) == Decimal("20")
    assert updated["name"] is None
    assert updated["symbol"] == "NQ"


def test_validation(client):
    assert client.post("/instruments", json={**NQ, "symbol": ""}).status_code == 422
    assert client.post("/instruments", json={**NQ, "tick_size": "0"}).status_code == 422
    assert client.post("/instruments", json={**NQ, "tick_value": "-1"}).status_code == 422
    instrument = _create(client)
    assert client.patch(f"/instruments/{instrument['id']}", json={"symbol": None}).status_code == 422
    assert client.patch(f"/instruments/{instrument['id']}", json={"tick_size": "0"}).status_code == 422


def test_duplicate_symbol_is_a_conflict_for_the_same_user_only(client, other_client):
    _create(client)

    assert client.post("/instruments", json=NQ).status_code == 409
    assert other_client.post("/instruments", json=NQ).status_code == 201


def test_renaming_to_an_existing_symbol_is_a_conflict(client):
    _create(client)
    es = _create(client, symbol="ES")
    assert client.patch(f"/instruments/{es['id']}", json={"symbol": "nq"}).status_code == 409


def test_archive_and_unarchive(client):
    instrument = _create(client)

    assert client.post(f"/instruments/{instrument['id']}/archive").json()["archived_at"] is not None
    assert client.get("/instruments").json() == []
    assert len(client.get("/instruments?include_archived=true").json()) == 1
    assert client.post(f"/instruments/{instrument['id']}/unarchive").json()["archived_at"] is None


def test_unused_instrument_can_be_deleted(client):
    instrument = _create(client)
    assert client.delete(f"/instruments/{instrument['id']}").status_code == 204
    assert client.get(f"/instruments/{instrument['id']}").status_code == 404


def test_instrument_with_trades_cannot_be_deleted(client, add_trade):
    account = client.post(
        "/accounts", json={"name": "A", "starting_balance": "1000", "currency": "USD"}
    ).json()
    instrument = _create(client)
    add_trade(account["id"], instrument["id"])

    response = client.delete(f"/instruments/{instrument['id']}")

    assert response.status_code == 409
    assert "archive" in response.json()["detail"].lower()


def test_other_users_cannot_see_or_change_an_instrument(client, other_client):
    instrument = _create(client)
    url = f"/instruments/{instrument['id']}"

    assert other_client.get("/instruments").json() == []
    assert other_client.get(url).status_code == 404
    assert other_client.patch(url, json={"tick_value": "99"}).status_code == 404
    assert other_client.post(f"{url}/archive").status_code == 404
    assert other_client.delete(url).status_code == 404
    assert Decimal(client.get(url).json()["tick_value"]) == Decimal("5")
