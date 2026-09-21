from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.config import settings
from app.db import Base, get_db
from app.main import app
from app.models import User

ORIGIN = settings.allowed_origins[0]


@pytest.fixture(autouse=True)
def fresh_login_limiter():
    from app.rate_limit import login_limiter

    login_limiter.clear()
    yield
    login_limiter.clear()


def _make_engine(url: str) -> Engine:
    if not url.startswith("sqlite"):
        return create_engine(url)
    engine = create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    return engine


@pytest.fixture(scope="session")
def test_engine() -> Iterator[Engine]:
    engine = _make_engine(settings.test_database_url)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except OperationalError:
        pytest.skip("test Postgres not reachable (start it with docker compose up -d db)")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db_session(test_engine: Engine) -> Iterator[Session]:
    connection = test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def api_db(test_engine: Engine) -> Iterator[sessionmaker[Session]]:
    """Committing sessions for API tests; every table is emptied afterwards."""
    factory = sessionmaker(bind=test_engine, expire_on_commit=False)
    yield factory
    with test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture
def make_user(api_db: sessionmaker[Session]):
    from app.security import hash_password

    def _make(email: str = "trader@example.com", password: str = "correct horse battery") -> User:
        with api_db() as session:
            user = User(email=email, password_hash=hash_password(password))
            session.add(user)
            session.commit()
            return user

    return _make


@pytest.fixture
def make_client(api_db: sessionmaker[Session]):
    def _make(headers: dict[str, str] | None = None) -> TestClient:
        def override_get_db() -> Iterator[Session]:
            with api_db() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db
        return TestClient(app, headers={"Origin": ORIGIN, **(headers or {})})

    yield _make
    app.dependency_overrides.clear()


def login(client: TestClient, email: str, password: str = "correct horse battery") -> None:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text


@pytest.fixture
def client(make_user, make_client) -> TestClient:
    make_user("trader@example.com")
    logged_in = make_client()
    login(logged_in, "trader@example.com")
    return logged_in


@pytest.fixture
def other_client(client, make_user, make_client) -> TestClient:
    make_user("other@example.com")
    logged_in = make_client()
    login(logged_in, "other@example.com")
    return logged_in


@pytest.fixture
def add_trade(api_db: sessionmaker[Session]):
    """Inserts a minimal closed trade so 'referenced' rules can be exercised."""
    from datetime import datetime, timezone
    from decimal import Decimal

    from app.models import Trade

    def _add(account_id: int, instrument_id: int, setup_id: int | None = None) -> int:
        opened = datetime(2026, 9, 8, 9, 35, tzinfo=timezone.utc)
        with api_db() as session:
            trade = Trade(
                account_id=account_id,
                instrument_id=instrument_id,
                setup_id=setup_id,
                direction="long",
                opened_at=opened,
                closed_at=opened,
                quantity=Decimal("1"),
                avg_entry=Decimal("100"),
                avg_exit=Decimal("101"),
                gross_pnl=Decimal("4"),
                fees_total=Decimal("0"),
                net_pnl=Decimal("4"),
            )
            session.add(trade)
            session.commit()
            return trade.id

    return _add


@pytest.fixture
def add_check(api_db: sessionmaker[Session]):
    from app.models import TradeCriterionCheck

    def _add(trade_id: int, criterion_id: int, checked: bool = True) -> None:
        with api_db() as session:
            session.add(TradeCriterionCheck(trade_id=trade_id, criterion_id=criterion_id, checked=checked))
            session.commit()

    return _add
