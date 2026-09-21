import pytest
from pydantic import ValidationError

from app.config import Settings

PRODUCTION = {
    "environment": "production",
    "jwt_secret": "x" * 32,
    "allowed_origin": "https://journal.vercel.app",
}

SUPABASE_POOLER = "postgresql://postgres.abcd1234:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("postgres://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
        ("postgresql://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
        (SUPABASE_POOLER, SUPABASE_POOLER.replace("postgresql://", "postgresql+psycopg://")),
        ("postgres://u:p@h:5432/db?sslmode=require", "postgresql+psycopg://u:p@h:5432/db?sslmode=require"),
        ("postgresql+psycopg://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
        ("sqlite://", "sqlite://"),
    ],
)
def test_database_urls_are_normalised_to_the_psycopg_driver(given, expected):
    assert Settings(database_url=given).database_url == expected
    assert Settings(test_database_url=given).test_database_url == expected


def test_production_accepts_a_complete_configuration():
    Settings(**PRODUCTION)


@pytest.mark.parametrize(
    "origin",
    [
        "http://localhost:5173",
        "http://journal.vercel.app",
        "https://journal.vercel.app,http://localhost:5173",
        "",
    ],
)
def test_production_requires_https_origins(origin):
    with pytest.raises(ValueError, match="ALLOWED_ORIGIN"):
        Settings(**{**PRODUCTION, "allowed_origin": origin})


def test_production_accepts_several_https_origins():
    Settings(**{**PRODUCTION, "allowed_origin": "https://a.example.com, https://b.example.com/"})


def test_development_keeps_the_localhost_origin_default():
    assert Settings().allowed_origins == ["http://localhost:5173"]


@pytest.mark.parametrize(
    "storage",
    [{"supabase_url": "https://abcd.supabase.co"}, {"supabase_service_key": "service-key"}],
)
def test_supabase_url_and_key_must_be_set_together(storage):
    with pytest.raises(ValueError, match="SUPABASE_URL and SUPABASE_SERVICE_KEY"):
        Settings(**storage)


@pytest.mark.parametrize(
    "storage",
    [
        {},
        {"supabase_url": "", "supabase_service_key": ""},
        {"supabase_url": "https://abcd.supabase.co", "supabase_service_key": "service-key"},
    ],
)
def test_supabase_may_be_unset_or_fully_set(storage):
    Settings(**storage)


def test_login_limit_defaults_and_bounds():
    settings = Settings()
    assert (settings.login_max_failures, settings.login_window_seconds, settings.trusted_proxy_hops) == (5, 900, 0)
    for bad in ({"login_max_failures": 0}, {"login_window_seconds": 0}, {"trusted_proxy_hops": -1}):
        with pytest.raises(ValidationError):
            Settings(**bad)
