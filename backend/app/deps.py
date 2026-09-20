from typing import TypeVar

import jwt
from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import Base, get_db
from app.models import User
from app.security import decode_access_token

STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

T = TypeVar("T", bound=Base)


def require_allowed_origin(request: Request) -> None:
    """CSRF guard: browsers always send Origin on cross-site writes, so a missing or foreign one is refused."""
    if request.method not in STATE_CHANGING_METHODS:
        return
    origin = (request.headers.get("origin") or "").rstrip("/")
    if origin not in settings.allowed_origins:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Origin not allowed")


def get_current_user(
    db: Session = Depends(get_db),
    token: str | None = Cookie(default=None, alias=settings.cookie_name),
) -> User:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    if token is None:
        raise unauthorized
    try:
        user_id = decode_access_token(token)
    except jwt.PyJWTError:
        raise unauthorized from None
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user


def get_owned(db: Session, model: type[T], object_id: int, user: User) -> T:
    """Rows of another user answer 404, the same as missing rows, so ids reveal nothing."""
    obj = db.get(model, object_id)
    if obj is None or obj.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found")
    return obj
