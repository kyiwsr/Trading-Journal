from datetime import datetime, timedelta, timezone
from functools import lru_cache

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import settings

_hasher = PasswordHasher()
_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


@lru_cache
def dummy_password_hash() -> str:
    """Verified against when the email is unknown so both login failures cost the same."""
    return hash_password("not-a-real-password")


def create_access_token(user_id: int, expires_in: timedelta | None = None) -> str:
    now = datetime.now(timezone.utc)
    lifetime = expires_in if expires_in is not None else timedelta(minutes=settings.jwt_expire_minutes)
    claims = {"sub": str(user_id), "iat": now, "exp": now + lifetime}
    return jwt.encode(claims, settings.jwt_secret, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> int:
    claims = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[_ALGORITHM],
        options={"require": ["exp", "sub"]},
    )
    try:
        return int(claims["sub"])
    except ValueError as exc:
        raise jwt.InvalidTokenError("subject is not a user id") from exc
