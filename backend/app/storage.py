import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Supabase signed upload URLs stay valid for two hours.
UPLOAD_LINK_SECONDS = 2 * 60 * 60


class StorageError(Exception):
    pass


class StorageNotConfigured(StorageError):
    pass


@dataclass(frozen=True)
class SignedUpload:
    url: str
    expires_in: int


class Storage(Protocol):
    def signed_upload(self, path: str, content_type: str) -> SignedUpload: ...

    def signed_read_url(self, path: str) -> str | None: ...


class NullStorage:
    """Used until Supabase is configured: uploads are refused and screenshots have no readable URL."""

    def signed_upload(self, path: str, content_type: str) -> SignedUpload:
        raise StorageNotConfigured("Screenshot storage is not configured")

    def signed_read_url(self, path: str) -> str | None:
        return None


class SupabaseStorage:
    """Thin client over the Supabase Storage REST API; the service key never leaves the server."""

    def __init__(
        self,
        url: str,
        service_key: str,
        bucket: str,
        read_ttl_seconds: int,
        client: httpx.Client | None = None,
    ) -> None:
        self._base = url.rstrip("/") + "/storage/v1"
        self._bucket = bucket
        self._read_ttl = read_ttl_seconds
        self._headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}
        self._client = client or httpx.Client(timeout=10)

    def _sign(self, endpoint: str, key: str, path: str, **request) -> str:
        try:
            response = self._client.post(
                f"{self._base}/object/{endpoint}/{self._bucket}/{path}", headers=self._headers, **request
            )
            response.raise_for_status()
            return f"{self._base}{response.json()[key]}"
        except (httpx.HTTPError, KeyError, ValueError) as error:
            raise StorageError(f"Supabase Storage request failed: {type(error).__name__}") from error

    def signed_upload(self, path: str, content_type: str) -> SignedUpload:
        return SignedUpload(self._sign("upload/sign", "url", path), UPLOAD_LINK_SECONDS)

    def signed_read_url(self, path: str) -> str | None:
        try:
            return self._sign("sign", "signedURL", path, json={"expiresIn": self._read_ttl})
        except StorageError:
            logger.warning("Could not sign a read URL for %s", path, exc_info=True)
            return None


@lru_cache
def _supabase() -> SupabaseStorage:
    return SupabaseStorage(
        settings.supabase_url,
        settings.supabase_service_key,
        settings.supabase_bucket,
        settings.signed_read_ttl_seconds,
    )


def get_storage() -> Storage:
    if settings.supabase_url and settings.supabase_service_key:
        return _supabase()
    return NullStorage()
