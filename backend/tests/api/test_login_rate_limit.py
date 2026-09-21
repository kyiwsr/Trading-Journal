import pytest

from app.config import settings
from app.rate_limit import login_limiter

PASSWORD = "correct horse battery"


class FakeClock:
    def __init__(self, now: float = 1000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def attempt(client, email="trader@example.com", password="nope", ip=None):
    headers = {"X-Forwarded-For": ip} if ip else {}
    return client.post("/auth/login", json={"email": email, "password": password}, headers=headers)


@pytest.fixture
def behind_one_proxy(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)


def test_sixth_failure_is_refused_with_retry_after(make_user, make_client):
    make_user("trader@example.com")
    client = make_client()

    assert [attempt(client).status_code for _ in range(5)] == [401] * 5
    blocked = attempt(client)

    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0
    assert blocked.json() == {"detail": "Too many failed sign-in attempts. Try again later."}
    assert "set-cookie" not in blocked.headers


def test_the_right_password_is_refused_while_blocked(make_user, make_client):
    make_user("trader@example.com")
    client = make_client()
    for _ in range(5):
        attempt(client)

    response = attempt(client, password=PASSWORD)

    assert response.status_code == 429
    assert "set-cookie" not in response.headers


def test_unknown_and_known_emails_are_blocked_identically(make_user, make_client):
    make_user("trader@example.com")
    client = make_client()
    for _ in range(5):
        attempt(client, email="ghost@example.com")

    ghost = attempt(client, email="ghost@example.com")
    real = attempt(client, email="trader@example.com")

    assert ghost.status_code == real.status_code == 429
    assert ghost.json() == real.json()


def test_email_padding_and_case_do_not_dodge_the_limit(make_user, make_client, behind_one_proxy):
    make_user("trader@example.com")
    client = make_client()
    variants = ["trader@example.com", " Trader@Example.com", "TRADER@EXAMPLE.COM", "trader@example.com ", "Trader@example.com"]
    for i, email in enumerate(variants):
        attempt(client, email=email, ip=f"198.51.100.{i}")

    assert attempt(client, ip="198.51.100.99").status_code == 429


def test_a_successful_login_resets_that_emails_counter(make_user, make_client, behind_one_proxy):
    make_user("trader@example.com")
    client = make_client()
    for i in range(4):
        assert attempt(client, ip=f"198.51.100.{i}").status_code == 401

    assert attempt(client, password=PASSWORD, ip="198.51.100.50").status_code == 200

    for i in range(4):
        assert attempt(client, ip=f"198.51.100.{60 + i}").status_code == 401
    assert attempt(client, ip="198.51.100.70").status_code == 401
    assert attempt(client, ip="198.51.100.71").status_code == 429


def test_limits_are_tracked_per_ip_and_per_email(make_user, make_client, behind_one_proxy):
    make_user("trader@example.com")
    make_user("other@example.com")
    client = make_client()
    for _ in range(5):
        attempt(client, email="trader@example.com", ip="198.51.100.1")

    other_email_other_ip = attempt(client, email="other@example.com", password=PASSWORD, ip="198.51.100.2")
    same_email_other_ip = attempt(client, email="trader@example.com", ip="198.51.100.2")
    other_email_same_ip = attempt(client, email="other@example.com", password=PASSWORD, ip="198.51.100.1")

    assert other_email_other_ip.status_code == 200
    assert same_email_other_ip.status_code == 429
    assert other_email_same_ip.status_code == 429


def test_one_ip_cannot_probe_many_emails(make_user, make_client, behind_one_proxy):
    make_user("trader@example.com")
    client = make_client()
    for i in range(5):
        attempt(client, email=f"guess{i}@example.com", ip="198.51.100.1")

    assert attempt(client, password=PASSWORD, ip="198.51.100.1").status_code == 429
    assert attempt(client, password=PASSWORD, ip="198.51.100.2").status_code == 200


def test_forwarded_for_is_ignored_when_no_proxy_is_trusted(make_user, make_client):
    make_user("trader@example.com")
    client = make_client()
    for i in range(5):
        attempt(client, email=f"guess{i}@example.com", ip=f"198.51.100.{i}")

    assert attempt(client, password=PASSWORD, ip="198.51.100.200").status_code == 429


def test_the_block_lifts_after_the_window(make_user, make_client, monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr(login_limiter, "_clock", clock)
    make_user("trader@example.com")
    client = make_client()
    for _ in range(5):
        attempt(client)
    assert attempt(client, password=PASSWORD).status_code == 429

    clock.now += settings.login_window_seconds

    assert attempt(client, password=PASSWORD).status_code == 200


def test_a_blocked_attempt_does_not_extend_the_block(make_user, make_client, monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr(login_limiter, "_clock", clock)
    make_user("trader@example.com")
    client = make_client()
    for _ in range(5):
        attempt(client)
    clock.now += settings.login_window_seconds - 1
    assert attempt(client).status_code == 429

    clock.now += 1

    assert attempt(client, password=PASSWORD).status_code == 200


def test_the_limiter_uses_its_configured_maximum(make_user, make_client, monkeypatch):
    monkeypatch.setattr(login_limiter, "max_failures", 2)
    make_user("trader@example.com")
    client = make_client()

    assert [attempt(client).status_code for _ in range(3)] == [401, 401, 429]
