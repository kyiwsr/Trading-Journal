import pytest
from sqlalchemy import select

from app.models import User
from app.security import verify_password
from scripts.seed_user import seed_user


def test_creates_the_user_with_a_hashed_password(db_session):
    user = seed_user(db_session, "  Me@Example.com ", "a long enough password")

    saved = db_session.scalar(select(User).where(User.id == user.id))
    assert saved.email == "me@example.com"
    assert saved.password_hash != "a long enough password"
    assert verify_password(saved.password_hash, "a long enough password")


def test_refuses_to_overwrite_an_existing_user(db_session):
    seed_user(db_session, "me@example.com", "a long enough password")
    with pytest.raises(SystemExit, match="already exists"):
        seed_user(db_session, "me@example.com", "another long password")


def test_reset_replaces_the_password(db_session):
    seed_user(db_session, "me@example.com", "a long enough password")
    user = seed_user(db_session, "me@example.com", "another long password", reset=True)
    assert verify_password(user.password_hash, "another long password")
    assert not verify_password(user.password_hash, "a long enough password")


def test_rejects_a_short_password(db_session):
    with pytest.raises(SystemExit, match="at least 12"):
        seed_user(db_session, "me@example.com", "short")


def test_rejects_an_email_without_an_at_sign(db_session):
    with pytest.raises(SystemExit, match="email"):
        seed_user(db_session, "not-an-email", "a long enough password")
