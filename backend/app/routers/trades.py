from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.trade import TradeDetailOut, TradeIn
from app.storage import Storage, get_storage
from app.trade_write import build_detail, delete_trade, get_owned_trade, save_trade

router = APIRouter(prefix="/trades", tags=["trades"])


@router.post("", response_model=TradeDetailOut, status_code=status.HTTP_201_CREATED)
def create_trade(
    body: TradeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: Storage = Depends(get_storage),
) -> TradeDetailOut:
    return build_detail(db, save_trade(db, user, body), user, storage)


@router.get("/{trade_id}", response_model=TradeDetailOut)
def read_trade(
    trade_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: Storage = Depends(get_storage),
) -> TradeDetailOut:
    return build_detail(db, get_owned_trade(db, trade_id, user), user, storage)


@router.put("/{trade_id}", response_model=TradeDetailOut)
def replace_trade(
    trade_id: int,
    body: TradeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: Storage = Depends(get_storage),
) -> TradeDetailOut:
    trade = get_owned_trade(db, trade_id, user)
    return build_detail(db, save_trade(db, user, body, trade), user, storage)


@router.delete("/{trade_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_trade(trade_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    delete_trade(db, get_owned_trade(db, trade_id, user))
