from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app import crud
from app.db import get_db
from app.deps import get_current_user, get_owned
from app.models import Account, FeeProfile, Trade, User
from app.schemas.account import AccountCreate, AccountOut, AccountUpdate

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _require_own_fee_profile(db: Session, user: User, fee_profile_id: int | None) -> None:
    if fee_profile_id is None:
        return
    profile = db.get(FeeProfile, fee_profile_id)
    if profile is None or profile.user_id != user.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "fee_profile_id does not exist")


@router.get("", response_model=list[AccountOut])
def list_accounts(
    include_archived: bool = False, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Account]:
    return crud.list_owned(db, Account, user, include_archived)


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(body: AccountCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Account:
    _require_own_fee_profile(db, user, body.fee_profile_id)
    account = Account(user_id=user.id, **body.model_dump())
    db.add(account)
    crud.commit(db)
    return account


@router.get("/{account_id}", response_model=AccountOut)
def get_account(account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Account:
    return get_owned(db, Account, account_id, user)


@router.patch("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int, body: AccountUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Account:
    account = get_owned(db, Account, account_id, user)
    changes = body.changes()
    _require_own_fee_profile(db, user, changes.get("fee_profile_id"))
    crud.apply_changes(account, changes)
    crud.commit(db)
    return account


@router.post("/{account_id}/archive", response_model=AccountOut)
def archive_account(account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Account:
    return crud.set_archived(db, get_owned(db, Account, account_id, user), True)


@router.post("/{account_id}/unarchive", response_model=AccountOut)
def unarchive_account(account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Account:
    return crud.set_archived(db, get_owned(db, Account, account_id, user), False)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    account = get_owned(db, Account, account_id, user)
    has_trades = db.scalar(select(exists().where(Trade.account_id == account.id)))
    crud.delete_unless_referenced(db, account, has_trades, "account")
