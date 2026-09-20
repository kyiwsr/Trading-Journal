from decimal import Decimal

TARIFF = {
    "name": "Prop tariff",
    "notes": "per side",
    "components": [
        {"name": "Exchange fee", "amount": "1.60", "basis": "per_fill"},
        {"name": "Commission", "amount": "2.00", "basis": "per_contract"},
    ],
}


def _create(client, **overrides):
    response = client.post("/fee-profiles", json={**TARIFF, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def _components(profile):
    return [(c["name"], Decimal(c["amount"]), c["basis"]) for c in profile["components"]]


def test_create_returns_components_in_order(client):
    profile = _create(client)

    assert profile["name"] == "Prop tariff"
    assert _components(profile) == [
        ("Exchange fee", Decimal("1.60"), "per_fill"),
        ("Commission", Decimal("2.00"), "per_contract"),
    ]


def test_profile_without_components_is_allowed(client):
    assert _create(client, components=[])["components"] == []


def test_get_and_list(client):
    profile = _create(client)
    assert client.get(f"/fee-profiles/{profile['id']}").json() == profile
    assert client.get("/fee-profiles").json() == [profile]


def test_component_validation(client):
    bad_basis = [{"name": "x", "amount": "1", "basis": "per_lot"}]
    negative = [{"name": "x", "amount": "-1", "basis": "per_fill"}]
    blank = [{"name": " ", "amount": "1", "basis": "per_fill"}]
    for components in (bad_basis, negative, blank):
        assert client.post("/fee-profiles", json={**TARIFF, "components": components}).status_code == 422
    assert client.post("/fee-profiles", json={**TARIFF, "name": ""}).status_code == 422


def test_update_renames_without_touching_components(client):
    profile = _create(client)

    updated = client.patch(f"/fee-profiles/{profile['id']}", json={"name": "Renamed"}).json()

    assert updated["name"] == "Renamed"
    assert _components(updated) == _components(profile)


def test_update_replaces_the_whole_component_list(client):
    profile = _create(client)
    replacement = [{"name": "Regulatory fee", "amount": "0.06", "basis": "per_fill"}]

    updated = client.patch(f"/fee-profiles/{profile['id']}", json={"components": replacement}).json()

    assert _components(updated) == [("Regulatory fee", Decimal("0.06"), "per_fill")]
    assert _components(client.get(f"/fee-profiles/{profile['id']}").json()) == _components(updated)


def test_update_with_empty_list_clears_components(client):
    profile = _create(client)
    assert client.patch(f"/fee-profiles/{profile['id']}", json={"components": []}).json()["components"] == []


def test_update_rejects_null_name(client):
    profile = _create(client)
    assert client.patch(f"/fee-profiles/{profile['id']}", json={"name": None}).status_code == 422
    assert client.patch(f"/fee-profiles/{profile['id']}", json={"components": None}).status_code == 422


def test_archive_and_unarchive(client):
    profile = _create(client)

    assert client.post(f"/fee-profiles/{profile['id']}/archive").json()["archived_at"] is not None
    assert client.get("/fee-profiles").json() == []
    assert len(client.get("/fee-profiles?include_archived=true").json()) == 1
    assert client.post(f"/fee-profiles/{profile['id']}/unarchive").json()["archived_at"] is None


def test_unused_profile_can_be_deleted(client):
    profile = _create(client)
    assert client.delete(f"/fee-profiles/{profile['id']}").status_code == 204
    assert client.get(f"/fee-profiles/{profile['id']}").status_code == 404


def test_profile_used_by_an_account_cannot_be_deleted(client):
    profile = _create(client)
    client.post(
        "/accounts",
        json={"name": "A", "starting_balance": "1000", "currency": "USD", "fee_profile_id": profile["id"]},
    )

    response = client.delete(f"/fee-profiles/{profile['id']}")

    assert response.status_code == 409
    assert "archive" in response.json()["detail"].lower()


def test_templates_are_listed_and_labelled_as_examples(client):
    templates = client.get("/fee-templates").json()

    assert templates
    for template in templates:
        assert template["id"]
        assert template["name"].startswith("Example")
        assert template["components"]
        assert all(c["basis"] in ("per_fill", "per_contract") for c in template["components"])


def test_copying_a_template_creates_an_independent_profile(client):
    template = client.get("/fee-templates").json()[0]

    response = client.post("/fee-profiles/from-template", json={"template_id": template["id"]})
    profile = response.json()

    assert response.status_code == 201
    assert profile["name"] == template["name"]
    assert [c["name"] for c in profile["components"]] == [c["name"] for c in template["components"]]

    client.patch(f"/fee-profiles/{profile['id']}", json={"components": []})
    assert client.get("/fee-templates").json()[0]["components"] == template["components"]


def test_copying_a_template_accepts_a_custom_name(client):
    template = client.get("/fee-templates").json()[0]
    profile = client.post(
        "/fee-profiles/from-template", json={"template_id": template["id"], "name": "My broker"}
    ).json()
    assert profile["name"] == "My broker"


def test_unknown_template_is_404(client):
    assert client.post("/fee-profiles/from-template", json={"template_id": "nope"}).status_code == 404


def test_other_users_cannot_see_or_change_a_profile(client, other_client):
    profile = _create(client)
    url = f"/fee-profiles/{profile['id']}"

    assert other_client.get("/fee-profiles").json() == []
    assert other_client.get(url).status_code == 404
    assert other_client.patch(url, json={"name": "Hijacked"}).status_code == 404
    assert other_client.post(f"{url}/archive").status_code == 404
    assert other_client.delete(url).status_code == 404
    assert client.get(url).json()["name"] == "Prop tariff"
