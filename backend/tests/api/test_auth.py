from datetime import timedelta

from app.config import settings
from app.security import create_access_token
from tests.conftest import ORIGIN, login

PASSWORD = "correct horse battery"


def test_login_sets_an_httponly_session_cookie(make_user, make_client):
    make_user("trader@example.com")
    client = make_client()

    response = client.post("/auth/login", json={"email": "trader@example.com", "password": PASSWORD})

    assert response.status_code == 200
    assert response.json()["email"] == "trader@example.com"
    assert "password" not in response.text
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{settings.cookie_name}=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Secure" not in cookie


def test_me_returns_the_logged_in_user(make_user, make_client):
    user = make_user("trader@example.com")
    client = make_client()
    login(client, "trader@example.com")

    response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json() == {"id": user.id, "email": "trader@example.com"}


def test_login_ignores_email_case_and_padding(make_user, make_client):
    make_user("trader@example.com")
    client = make_client()
    response = client.post("/auth/login", json={"email": "  Trader@Example.COM ", "password": PASSWORD})
    assert response.status_code == 200


def test_wrong_password_and_unknown_email_look_identical(make_user, make_client):
    make_user("trader@example.com")
    client = make_client()

    wrong_password = client.post("/auth/login", json={"email": "trader@example.com", "password": "nope"})
    unknown_email = client.post("/auth/login", json={"email": "ghost@example.com", "password": PASSWORD})

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()
    assert "set-cookie" not in wrong_password.headers


def test_missing_cookie_is_unauthorized(make_client):
    assert make_client().get("/auth/me").status_code == 401


def test_expired_token_is_unauthorized(make_user, make_client):
    user = make_user()
    client = make_client()
    client.cookies.set(settings.cookie_name, create_access_token(user.id, expires_in=timedelta(seconds=-5)))
    assert client.get("/auth/me").status_code == 401


def test_tampered_token_is_unauthorized(make_user, make_client):
    user = make_user()
    client = make_client()
    token = create_access_token(user.id)
    client.cookies.set(settings.cookie_name, token[:-3] + "abc")
    assert client.get("/auth/me").status_code == 401


def test_token_for_a_deleted_user_is_unauthorized(make_client):
    client = make_client()
    client.cookies.set(settings.cookie_name, create_access_token(987654))
    assert client.get("/auth/me").status_code == 401


def test_logout_clears_the_session(make_user, make_client):
    make_user("trader@example.com")
    client = make_client()
    login(client, "trader@example.com")

    response = client.post("/auth/logout")

    assert response.status_code == 204
    assert client.get("/auth/me").status_code == 401


def test_health_stays_public(make_client):
    assert make_client().get("/health").status_code == 200


def test_state_changing_request_from_a_foreign_origin_is_forbidden(make_user, make_client):
    make_user("trader@example.com")
    client = make_client(headers={"Origin": "https://evil.example.com"})
    response = client.post("/auth/login", json={"email": "trader@example.com", "password": PASSWORD})
    assert response.status_code == 403


def test_state_changing_request_without_origin_is_forbidden(make_user, make_client):
    make_user("trader@example.com")
    client = make_client()
    del client.headers["Origin"]
    response = client.post("/auth/login", json={"email": "trader@example.com", "password": PASSWORD})
    assert response.status_code == 403


def test_reads_do_not_need_an_origin(make_user, make_client):
    make_user("trader@example.com")
    client = make_client()
    login(client, "trader@example.com")
    del client.headers["Origin"]
    assert client.get("/auth/me").status_code == 200


def test_cors_allows_credentials_only_for_the_configured_origin(make_client):
    client = make_client()
    request_headers = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}

    allowed = client.options("/auth/login", headers={"Origin": ORIGIN, **request_headers})
    denied = client.options("/auth/login", headers={"Origin": "https://evil.example.com", **request_headers})

    assert allowed.headers["access-control-allow-origin"] == ORIGIN
    assert allowed.headers["access-control-allow-credentials"] == "true"
    assert "access-control-allow-origin" not in denied.headers


def test_cookie_flags_follow_settings(make_user, make_client, monkeypatch):
    make_user("trader@example.com")
    monkeypatch.setattr(settings, "cookie_secure", True)
    monkeypatch.setattr(settings, "cookie_samesite", "none")
    monkeypatch.setattr(settings, "cookie_domain", "example.com")
    client = make_client()

    cookie = client.post("/auth/login", json={"email": "trader@example.com", "password": PASSWORD}).headers["set-cookie"]

    assert "Secure" in cookie
    assert "SameSite=none" in cookie
    assert "Domain=example.com" in cookie
