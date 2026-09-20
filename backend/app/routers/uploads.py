import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import settings
from app.deps import get_current_user
from app.models import User
from app.schemas.upload import UploadOut, UploadRequest
from app.storage import Storage, StorageError, StorageNotConfigured, get_storage

router = APIRouter(prefix="/uploads", tags=["uploads"])

EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


@router.post("/screenshot", response_model=UploadOut)
def request_screenshot_upload(
    body: UploadRequest, user: User = Depends(get_current_user), storage: Storage = Depends(get_storage)
) -> UploadOut:
    if body.size_bytes > settings.upload_max_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Screenshots can be at most {settings.upload_max_bytes} bytes")
    path = f"{user.id}/{uuid.uuid4().hex}.{EXTENSIONS[body.content_type]}"
    try:
        signed = storage.signed_upload(path, body.content_type)
    except StorageNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error
    except StorageError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Screenshot storage is unavailable") from error
    return UploadOut(path=path, upload_url=signed.url, expires_in=signed.expires_in)
