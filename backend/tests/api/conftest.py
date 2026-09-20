from types import SimpleNamespace

import pytest

TARIFF = {
    "name": "Example prop tariff",
    "components": [
        {"name": "Exchange fees", "amount": "1.60", "basis": "per_fill"},
        {"name": "Broker commission", "amount": "2.00", "basis": "per_fill"},
        {"name": "Regulatory fee", "amount": "0.06", "basis": "per_fill"},
    ],
}

# Weights and labels follow the mockup's Trade #71 checklist; the fourth item is the one it violates.
CELUP_KAKI = {
    "name": "celup kaki",
    "subtitle": "Liquidity Sweep Scalp",
    "criteria": [
        {"label": "Liquidity sweep confirmed", "weight": "25"},
        {"label": "5m market structure shift with displacement", "weight": "25"},
        {"label": "Stop placed before the order", "weight": "20"},
        {"label": "Wait for the 50% fibonacci retest", "weight": "15"},
        {"label": "Scale out 50% at internal liquidity", "weight": "15"},
    ],
}


def fill(kind, price, quantity, when, note=None):
    return {"fill_type": kind, "price": price, "quantity": quantity, "filled_at": when, "note": note}


def create_world(client):
    profile = client.post("/fee-profiles", json=TARIFF).json()
    account = client.post(
        "/accounts",
        json={"name": "Apex 150k", "label": "#APX-9821", "starting_balance": "150000", "fee_profile_id": profile["id"]},
    ).json()
    nq = client.post("/instruments", json={"symbol": "NQ", "tick_size": "0.25", "tick_value": "5"}).json()
    setup = client.post("/setups", json=CELUP_KAKI).json()
    return SimpleNamespace(profile=profile, account=account, nq=nq, setup=setup)


@pytest.fixture
def world(client):
    return create_world(client)


def trade71(world, **overrides):
    """Request body for the mockup's Trade #71: NQ long, scaled in twice and out twice."""
    criteria = world.setup["criteria"]
    body = {
        "account_id": world.account["id"],
        "instrument_id": world.nq["id"],
        "setup_id": world.setup["id"],
        "direction": "long",
        "session": "NY open",
        "tags": ["London sweep", "5m MSS", "Runner"],
        "stop_price": "20372.75",
        "target_price": "20397.75",
        "fills": [
            fill("entry", "20380.25", "1", "2026-09-08T09:35:12Z", "Initial probe"),
            fill("entry", "20377.75", "1", "2026-09-08T09:38:40Z", "Retest double-down"),
            fill("exit", "20391.00", "1", "2026-09-08T09:52:10Z", "TP1, 50% banked"),
            fill("exit", "20397.25", "1", "2026-09-08T10:14:08Z", "Runner"),
        ],
        "criteria_checks": [
            {"criterion_id": criteria[0]["id"], "checked": True, "note": "Sweep at 09:32:05"},
            {"criterion_id": criteria[1]["id"], "checked": True},
            {"criterion_id": criteria[2]["id"], "checked": True},
            {
                "criterion_id": criteria[3]["id"],
                "checked": False,
                "note": "Scale-in entered 3 ticks above the 50% level",
            },
            {"criterion_id": criteria[4]["id"], "checked": True},
        ],
        "pre_trade_focus": "Calm, zero tilt",
        "environment": "NY open, London sweep",
        "debrief_notes": "Clean execution on the sweep.",
    }
    body.update(overrides)
    return body


class FakeStorage:
    """Reaches nothing: URLs are derived from the path so tests can assert on them."""

    def __init__(self):
        self.uploads = []

    def signed_upload(self, path, content_type):
        from app.storage import SignedUpload

        self.uploads.append((path, content_type))
        return SignedUpload(f"https://storage.test/upload/{path}?token=t", 7200)

    def signed_read_url(self, path):
        return f"https://storage.test/read/{path}"


@pytest.fixture
def fake_storage(client):
    from app.main import app
    from app.storage import get_storage

    storage = FakeStorage()
    app.dependency_overrides[get_storage] = lambda: storage
    return storage
