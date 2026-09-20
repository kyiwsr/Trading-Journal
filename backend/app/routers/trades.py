from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.trade import TradeDetailOut, TradeIn
from app.storage import Storage, get_storage
from app.trade_write import build_detail, save_trade

router = APIRouter(prefix="/trades", tags=["trades"])


@router.post("", response_model=TradeDetailOut, status_code=status.HTTP_201_CREATED)
def create_trade(
    body: TradeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: Storage = Depends(get_storage),
) -> TradeDetailOut:
    return build_detail(db, save_trade(db, user, body), user, storage)
