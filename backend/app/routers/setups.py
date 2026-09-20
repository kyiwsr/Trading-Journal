from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app import crud
from app.db import get_db
from app.deps import get_current_user, get_owned
from app.models import Setup, SetupCriterion, Trade, TradeCriterionCheck, User
from app.schemas.setup import CriterionUpsert, SetupCreate, SetupOut, SetupUpdate

router = APIRouter(prefix="/setups", tags=["setups"])


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail)


@router.get("", response_model=list[SetupOut])
def list_setups(
    include_archived: bool = False, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Setup]:
    return crud.list_owned(db, Setup, user, include_archived)


@router.post("", response_model=SetupOut, status_code=status.HTTP_201_CREATED)
def create_setup(body: SetupCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Setup:
    setup = Setup(
        user_id=user.id,
        name=body.name,
        subtitle=body.subtitle,
        description=body.description,
        criteria=[
            SetupCriterion(label=item.label, weight=item.weight, display_order=order)
            for order, item in enumerate(body.criteria)
        ],
    )
    db.add(setup)
    crud.commit(db)
    return setup


@router.get("/{setup_id}", response_model=SetupOut)
def get_setup(setup_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Setup:
    return get_owned(db, Setup, setup_id, user)


@router.patch("/{setup_id}", response_model=SetupOut)
def update_setup(
    setup_id: int, body: SetupUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Setup:
    setup = get_owned(db, Setup, setup_id, user)
    crud.apply_changes(setup, body.changes())
    crud.commit(db)
    return setup


@router.put("/{setup_id}/criteria", response_model=SetupOut)
def replace_criteria(
    setup_id: int, body: list[CriterionUpsert], db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Setup:
    """Ordered replace: an id keeps its row and history, no id adds a row, omitted rows are removed."""
    setup = get_owned(db, Setup, setup_id, user)
    existing = {c.id: c for c in setup.criteria}

    kept_ids = [item.id for item in body if item.id is not None]
    if len(set(kept_ids)) != len(kept_ids):
        raise _unprocessable("A criterion id appears more than once")
    unknown = [i for i in kept_ids if i not in existing]
    if unknown:
        raise _unprocessable(f"Criteria {unknown} do not belong to this setup")

    removed = [c.id for c in setup.criteria if c.id not in kept_ids]
    if removed and db.scalar(select(exists().where(TradeCriterionCheck.criterion_id.in_(removed)))):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A criterion you removed is used by logged trades. Keep it, or archive the setup instead.",
        )

    ordered = []
    for order, item in enumerate(body):
        criterion = existing[item.id] if item.id is not None else SetupCriterion()
        criterion.label, criterion.weight, criterion.display_order = item.label, item.weight, order
        ordered.append(criterion)
    setup.criteria = ordered
    crud.commit(db)
    return setup


@router.post("/{setup_id}/archive", response_model=SetupOut)
def archive_setup(setup_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Setup:
    return crud.set_archived(db, get_owned(db, Setup, setup_id, user), True)


@router.post("/{setup_id}/unarchive", response_model=SetupOut)
def unarchive_setup(setup_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Setup:
    return crud.set_archived(db, get_owned(db, Setup, setup_id, user), False)


@router.delete("/{setup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_setup(setup_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    setup = get_owned(db, Setup, setup_id, user)
    has_trades = db.scalar(select(exists().where(Trade.setup_id == setup.id)))
    crud.delete_unless_referenced(db, setup, has_trades, "setup")
