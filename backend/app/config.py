from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-secret-do-not-use-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "production"] = "development"

    database_url: str = "postgresql+psycopg://journal:journal@localhost:5432/journal"
    test_database_url: str = "postgresql+psycopg://journal:journal@localhost:5432/journal_test"

    # Comma-separated. Used for CORS and as the Origin allowlist on state-changing requests.
    allowed_origin: str = "http://localhost:5173"

    jwt_secret: str = DEV_JWT_SECRET
    jwt_expire_minutes: int = 60 * 24 * 7

    cookie_name: str = "tj_session"
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_domain: str | None = None

    login_max_failures: int = Field(default=5, ge=1)
    login_window_seconds: int = Field(default=15 * 60, ge=1)
    # Proxies in front of the API that append to X-Forwarded-For (Vercel rewrite + Render edge = 2).
    trusted_proxy_hops: int = Field(default=0, ge=0)

    supabase_url: str | None = None
    supabase_service_key: str | None = None
    supabase_bucket: str = "screenshots"
    upload_max_bytes: int = 5 * 1024 * 1024
    signed_read_ttl_seconds: int = 3600

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.allowed_origin.split(",") if o.strip()]

    @field_validator("database_url", "test_database_url")
    @classmethod
    def _use_psycopg_driver(cls, url: str) -> str:
        # Supabase and Render hand out postgres:// or postgresql://, which SQLAlchemy would load with psycopg2.
        for scheme in ("postgres://", "postgresql://"):
            if url.startswith(scheme):
                return "postgresql+psycopg://" + url[len(scheme):]
        return url

    @model_validator(mode="after")
    def _check_production(self) -> "Settings":
        if bool(self.supabase_url) != bool(self.supabase_service_key):
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set together")
        if self.environment == "production":
            if self.jwt_secret == DEV_JWT_SECRET or len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET must be set to at least 32 characters in production")
            if self.cookie_samesite == "none" and not self.cookie_secure:
                raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true")
            origins = self.allowed_origins
            if not origins or not all(o.startswith("https://") for o in origins):
                raise ValueError("ALLOWED_ORIGIN must list only https:// origins in production")
        return self


settings = Settings()
