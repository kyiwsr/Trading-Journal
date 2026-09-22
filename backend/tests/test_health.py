from collections.abc import Iterator

from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.main import app


def test_health(make_client):
    response = make_client().get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_stays_ok_when_the_database_is_unreachable():
    class BrokenSession:
        def execute(self, *args, **kwargs):
            raise SQLAlchemyError("connection refused")

    def override_get_db() -> Iterator[Session]:
        yield BrokenSession()

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = TestClient(app).get("/health")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "unreachable"}
