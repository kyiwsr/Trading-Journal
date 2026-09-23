from decimal import Decimal

ACCOUNT = {
    "name": "Apex 150k",
    "label": "#APX-9821",
    "broker_name": "Rithmic",
    "route": "CME via Rithmic",
    "starting_balance": "150000",
    "currency": "usd",
}


def _create(client, **overrides):
    response = client.post("/accounts", json={**ACCOUNT, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def _instrument(client, symbol="NQ"):
    response = client.post("/instruments", json={"symbol": symbol, "tick_size": "0.25", "tick_value": "5"})
    assert response.status_code == 201, response.text
    return response.json()


def test_create_returns_the_account_with_normalised_currency(client):
    account = _create(client)

    assert account["name"] == "Apex 150k"
    assert account["currency"] == "USD"
    assert Decimal(account["starting_balance"]) == Decimal("150000")
    assert account["archived_at"] is None
    assert account["fee_profile_id"] is None


def test_get_and_list_return_the_created_account(client):
    account = _create(client)

    assert client.get(f"/accounts/{account['id']}").json() == account
    assert client.get("/accounts").json() == [account]


def test_update_changes_only_the_sent_fields(client):
    account = _create(client)

    response = client.patch(f"/accounts/{account['id']}", json={"name": "Apex 150k #2", "route": None})

    body = response.json()
    assert response.status_code == 200
    assert body["name"] == "Apex 150k #2"
    assert body["route"] is None
    assert body["label"] == "#APX-9821"


def test_update_rejects_null_for_required_fields(client):
    account = _create(client)
    assert client.patch(f"/accounts/{account['id']}", json={"name": None}).status_code == 422
    assert client.patch(f"/accounts/{account['id']}", json={"starting_balance": None}).status_code == 422


def test_create_validates_input(client):
    assert client.post("/accounts", json={**ACCOUNT, "name": " "}).status_code == 422
    assert client.post("/accounts", json={**ACCOUNT, "starting_balance": "-1"}).status_code == 422
    assert client.post("/accounts", json={**ACCOUNT, "currency": "US"}).status_code == 422
    missing = {k: v for k, v in ACCOUNT.items() if k != "starting_balance"}
    assert client.post("/accounts", json=missing).status_code == 422


def test_minimum_threshold_defaults_to_none(client):
    account = _create(client)
    assert account["minimum_threshold"] is None


def test_minimum_threshold_can_be_set_and_cleared(client):
    account = _create(client, minimum_threshold="24000")
    assert Decimal(account["minimum_threshold"]) == Decimal("24000")

    cleared = client.patch(f"/accounts/{account['id']}", json={"minimum_threshold": None}).json()
    assert cleared["minimum_threshold"] is None


def test_minimum_threshold_rejects_negative(client):
    assert client.post("/accounts", json={**ACCOUNT, "minimum_threshold": "-1"}).status_code == 422


def test_unknown_account_is_404(client):
    assert client.get("/accounts/9999").status_code == 404


def test_fee_profile_can_be_linked_and_cleared(client):
    profile = client.post("/fee-profiles", json={"name": "Tariff"}).json()

    account = _create(client, fee_profile_id=profile["id"])
    assert account["fee_profile_id"] == profile["id"]

    cleared = client.patch(f"/accounts/{account['id']}", json={"fee_profile_id": None}).json()
    assert cleared["fee_profile_id"] is None


def test_fee_profile_must_exist_and_belong_to_the_user(client, other_client):
    foreign = other_client.post("/fee-profiles", json={"name": "Not yours"}).json()

    assert client.post("/accounts", json={**ACCOUNT, "fee_profile_id": foreign["id"]}).status_code == 422
    assert client.post("/accounts", json={**ACCOUNT, "fee_profile_id": 9999}).status_code == 422
    account = _create(client)
    assert client.patch(f"/accounts/{account['id']}", json={"fee_profile_id": foreign["id"]}).status_code == 422


def test_archived_accounts_are_hidden_until_requested(client):
    account = _create(client)

    archived = client.post(f"/accounts/{account['id']}/archive").json()

    assert archived["archived_at"] is not None
    assert client.get("/accounts").json() == []
    assert [a["id"] for a in client.get("/accounts?include_archived=true").json()] == [account["id"]]

    restored = client.post(f"/accounts/{account['id']}/unarchive").json()
    assert restored["archived_at"] is None
    assert len(client.get("/accounts").json()) == 1


def test_unused_account_can_be_deleted(client):
    account = _create(client)

    assert client.delete(f"/accounts/{account['id']}").status_code == 204
    assert client.get(f"/accounts/{account['id']}").status_code == 404


def test_account_with_trades_cannot_be_deleted_but_can_be_archived(client, add_trade):
    account = _create(client)
    instrument = _instrument(client)
    add_trade(account["id"], instrument["id"])

    response = client.delete(f"/accounts/{account['id']}")

    assert response.status_code == 409
    assert "archive" in response.json()["detail"].lower()
    assert client.post(f"/accounts/{account['id']}/archive").status_code == 200


def test_other_users_cannot_see_or_change_an_account(client, other_client):
    account = _create(client)
    url = f"/accounts/{account['id']}"

    assert other_client.get("/accounts").json() == []
    assert other_client.get(url).status_code == 404
    assert other_client.patch(url, json={"name": "Hijacked"}).status_code == 404
    assert other_client.post(f"{url}/archive").status_code == 404
    assert other_client.post(f"{url}/unarchive").status_code == 404
    assert other_client.delete(url).status_code == 404
    assert client.get(url).json()["name"] == "Apex 150k"
