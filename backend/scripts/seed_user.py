"""Create the single journal user from SEED_EMAIL and SEED_PASSWORD.

Run from backend/: python -m scripts.seed_user [--reset]
"""

import os
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import User
from app.security import hash_password

MIN_PASSWORD_LENGTH = 12


def seed_user(session: Session, email: str, password: str, reset: bool = False) -> User:
    email = email.strip().lower()
    if "@" not in email:
        raise SystemExit("SEED_EMAIL is not a valid email address")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise SystemExit(f"SEED_PASSWORD must be at least {MIN_PASSWORD_LENGTH} characters")

    user = session.scalar(select(User).where(User.email == email))
    if user is not None and not reset:
        raise SystemExit(f"{email} already exists; pass --reset to replace the password")
    if user is None:
        user = User(email=email, password_hash=hash_password(password))
        session.add(user)
    else:
        user.password_hash = hash_password(password)
    session.flush()
    return user


def main() -> None:
    email, password = os.environ.get("SEED_EMAIL"), os.environ.get("SEED_PASSWORD")
    if not email or not password:
        raise SystemExit("Set SEED_EMAIL and SEED_PASSWORD in the environment")
    with SessionLocal() as session:
        user = seed_user(session, email, password, reset="--reset" in sys.argv[1:])
        session.commit()
        print(f"user ready: {user.email}")


if __name__ == "__main__":
    main()
