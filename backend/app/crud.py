from datetime import datetime, timezone
from typing import TypeVar

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import Base
from app.models import User

T = TypeVar("T", bound=Base)


def list_owned(db: Session, model: type[T], user: User, include_archived: bool) -> list[T]:
    stmt = select(model).where(model.user_id == user.id).order_by(model.id)
    if not include_archived:
        stmt = stmt.where(model.archived_at.is_(None))
    return list(db.scalars(stmt))


def apply_changes(obj: Base, changes: dict) -> None:
    for field, value in changes.items():
        setattr(obj, field, value)


def set_archived(db: Session, obj: T, archived: bool) -> T:
    obj.archived_at = datetime.now(timezone.utc) if archived else None
    db.commit()
    return obj


def delete_unless_referenced(db: Session, obj: Base, referenced: bool, what: str) -> None:
    if referenced:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This {what} is used by existing records. Archive it instead.")
    db.delete(obj)
    db.commit()


def commit(db: Session, conflict_message: str | None = None) -> None:
    """Commit, then expire everything so responses show the stored values (NUMERIC scale), not the inputs."""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if conflict_message is None:
            raise
        raise HTTPException(status.HTTP_409_CONFLICT, conflict_message) from None
    db.expire_all()
