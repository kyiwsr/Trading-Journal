from datetime import timedelta

import jwt
import pytest

from app.config import Settings
from app.security import create_access_token, decode_access_token, hash_password, verify_password

HTTPS_ORIGIN = "https://journal.example.com"


def test_password_hash_verifies_only_the_right_password():
    hashed = hash_password("s3cret pass")
    assert hashed != "s3cret pass"
    assert verify_password(hashed, "s3cret pass")
    assert not verify_password(hashed, "s3cret pasS")


def test_same_password_hashes_differently_each_time():
    assert hash_password("same") != hash_password("same")


def test_verify_rejects_a_malformed_hash():
    assert not verify_password("not-an-argon2-hash", "anything")


def test_token_round_trip_returns_user_id():
    assert decode_access_token(create_access_token(42)) == 42


def test_expired_token_is_rejected():
    token = create_access_token(1, expires_in=timedelta(seconds=-5))
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


def test_tampered_token_is_rejected():
    header, payload, signature = create_access_token(1).split(".")
    forged = jwt.encode({"sub": "2", "exp": 9999999999}, "another-secret", algorithm="HS256")
    for bad in (f"{header}.{payload}.{signature[:-2]}xx", forged):
        with pytest.raises(jwt.InvalidTokenError):
            decode_access_token(bad)


def test_unsigned_token_is_rejected():
    unsigned = jwt.encode({"sub": "1", "exp": 9999999999}, key=None, algorithm="none")
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(unsigned)


def test_token_without_expiry_is_rejected():
    from app.config import settings

    no_exp = jwt.encode({"sub": "1"}, settings.jwt_secret, algorithm="HS256")
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(no_exp)


def test_production_refuses_the_default_or_short_secret():
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(environment="production")
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(environment="production", jwt_secret="too-short")
    Settings(environment="production", jwt_secret="x" * 32, allowed_origin=HTTPS_ORIGIN)


def test_samesite_none_requires_secure_cookie_in_production():
    with pytest.raises(ValueError, match="COOKIE_SECURE"):
        Settings(environment="production", jwt_secret="x" * 32, cookie_samesite="none", cookie_secure=False)
    Settings(
        environment="production",
        jwt_secret="x" * 32,
        allowed_origin=HTTPS_ORIGIN,
        cookie_samesite="none",
        cookie_secure=True,
    )


def test_allowed_origins_are_split_and_trimmed():
    settings = Settings(allowed_origin="https://a.example.com/, http://localhost:5173 ")
    assert settings.allowed_origins == ["https://a.example.com", "http://localhost:5173"]
