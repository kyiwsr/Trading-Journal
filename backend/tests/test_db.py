from sqlalchemy import text


def test_db_session_roundtrip(db_session):
    assert db_session.execute(text("SELECT 1")).scalar() == 1
