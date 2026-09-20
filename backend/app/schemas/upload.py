from typing import Literal

from pydantic import BaseModel, Field

ContentType = Literal["image/png", "image/jpeg", "image/webp"]


class UploadRequest(BaseModel):
    content_type: ContentType
    size_bytes: int = Field(ge=1)


class UploadOut(BaseModel):
    path: str
    upload_url: str
    expires_in: int
