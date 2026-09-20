import pytest

PROTECTED = [
    ("GET", "/accounts"),
    ("POST", "/accounts"),
    ("GET", "/accounts/1"),
    ("PATCH", "/accounts/1"),
    ("POST", "/accounts/1/archive"),
    ("DELETE", "/accounts/1"),
    ("GET", "/instruments"),
    ("POST", "/instruments"),
    ("GET", "/instruments/1"),
    ("PATCH", "/instruments/1"),
    ("POST", "/instruments/1/archive"),
    ("DELETE", "/instruments/1"),
    ("GET", "/fee-templates"),
    ("GET", "/fee-profiles"),
    ("POST", "/fee-profiles"),
    ("POST", "/fee-profiles/from-template"),
    ("GET", "/fee-profiles/1"),
    ("PATCH", "/fee-profiles/1"),
    ("POST", "/fee-profiles/1/archive"),
    ("DELETE", "/fee-profiles/1"),
    ("GET", "/setups"),
    ("POST", "/setups"),
    ("GET", "/setups/1"),
    ("PATCH", "/setups/1"),
    ("PUT", "/setups/1/criteria"),
    ("POST", "/setups/1/archive"),
    ("POST", "/setups/1/unarchive"),
    ("DELETE", "/setups/1"),
    ("GET", "/settings"),
    ("PUT", "/settings"),
]


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_route_requires_login(make_client, method, path):
    response = make_client().request(method, path, json={} if method in ("POST", "PATCH", "PUT") else None)
    assert response.status_code == 401, f"{method} {path} answered {response.status_code}"
