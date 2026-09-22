import pytest

from tests.api.conftest import create_world, trade71

DEFAULTS = {
    "compliance_cutoff": 80,
    "has_seen_tour": False,
    "bands": {"elite_min": 85, "solid_min": 70, "sub_optimal_min": 60},
    "low_sample_threshold": 20,
    "elite_setup_min": 90,
}


def test_defaults_come_from_the_shared_constants(client):
    response = client.get("/settings")

    assert response.status_code == 200
    assert response.json() == DEFAULTS


def test_put_updates_only_the_cutoff_and_returns_the_full_settings(client):
    response = client.put("/settings", json={"compliance_cutoff": 75})

    assert response.status_code == 200
    assert response.json() == {**DEFAULTS, "compliance_cutoff": 75}
    assert client.get("/settings").json()["compliance_cutoff"] == 75


@pytest.mark.parametrize("cutoff", [0, 100])
def test_cutoff_accepts_the_range_edges(client, cutoff):
    assert client.put("/settings", json={"compliance_cutoff": cutoff}).json()["compliance_cutoff"] == cutoff


@pytest.mark.parametrize("cutoff", [-1, 101, 80.5, "high", None])
def test_cutoff_outside_zero_to_hundred_is_rejected(client, cutoff):
    assert client.put("/settings", json={"compliance_cutoff": cutoff}).status_code == 422
    assert client.get("/settings").json()["compliance_cutoff"] == 80


@pytest.mark.parametrize(
    "body",
    [{}, {"compliance_cutoff": 70, "bands": {"elite_min": 50}}, {"compliance_cutoff": 70, "low_sample_threshold": 1}],
)
def test_put_rejects_missing_or_read_only_fields(client, body):
    assert client.put("/settings", json=body).status_code == 422
    assert client.get("/settings").json() == DEFAULTS


def test_put_can_mark_the_tour_seen(client):
    response = client.put("/settings", json={"compliance_cutoff": 80, "has_seen_tour": True})

    assert response.json()["has_seen_tour"] is True
    assert client.get("/settings").json()["has_seen_tour"] is True


def test_put_without_has_seen_tour_leaves_it_unchanged(client):
    client.put("/settings", json={"compliance_cutoff": 80, "has_seen_tour": True})

    response = client.put("/settings", json={"compliance_cutoff": 90})

    assert response.json() == {**DEFAULTS, "compliance_cutoff": 90, "has_seen_tour": True}


def test_each_user_has_their_own_cutoff(client, other_client):
    client.put("/settings", json={"compliance_cutoff": 60})

    assert other_client.get("/settings").json()["compliance_cutoff"] == 80


def test_trade_compliance_follows_the_users_cutoff_but_the_band_does_not(client):
    world = create_world(client)
    created = client.post("/trades", json=trade71(world)).json()
    assert (created["execution_score"], created["score_band"], created["compliant"]) == (85, "elite", True)

    client.put("/settings", json={"compliance_cutoff": 90})

    detail = client.get(f"/trades/{created['id']}").json()
    assert (detail["execution_score"], detail["score_band"], detail["compliant"]) == (85, "elite", False)
    listed = client.get("/trades").json()["items"][0]
    assert (listed["score_band"], listed["compliant"]) == ("elite", False)

    client.put("/settings", json={"compliance_cutoff": 85})
    assert client.get(f"/trades/{created['id']}").json()["compliant"] is True
    assert client.get("/trades").json()["items"][0]["compliant"] is True


def test_an_unscored_trade_is_neither_compliant_nor_non_compliant(client):
    world = create_world(client)
    body = trade71(world, setup_id=None, criteria_checks=[])
    created = client.post("/trades", json=body).json()

    assert created["execution_score"] is None
    assert created["compliant"] is None
    assert client.get("/trades").json()["items"][0]["compliant"] is None


def test_dashboard_recent_trades_use_the_cutoff_too(client):
    world = create_world(client)
    client.post("/trades", json=trade71(world))
    client.put("/settings", json={"compliance_cutoff": 95})

    recent = client.get("/dashboard").json()["recent_trades"]

    assert [t["compliant"] for t in recent] == [False]
