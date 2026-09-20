from typing import Literal

from pydantic import model_validator
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

    supabase_url: str | None = None
    supabase_service_key: str | None = None
    supabase_bucket: str = "screenshots"
    upload_max_bytes: int = 5 * 1024 * 1024
    signed_read_ttl_seconds: int = 3600

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.allowed_origin.split(",") if o.strip()]

    @model_validator(mode="after")
    def _check_production(self) -> "Settings":
        if self.environment == "production":
            if self.jwt_secret == DEV_JWT_SECRET or len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET must be set to at least 32 characters in production")
            if self.cookie_samesite == "none" and not self.cookie_secure:
                raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true")
        return self


settings = Settings()
