from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.trade import Direction, TradeDetailOut, TradeIn, TradeListOut
from app.storage import Storage, get_storage
from app.trade_queries import (
    Order,
    RangeName,
    SortField,
    TradeFilters,
    all_trades,
    get_today,
    list_trades,
    range_start,
    resolve_account,
    trades_csv,
)
from app.trade_write import build_detail, delete_trade, get_owned_trade, save_trade

router = APIRouter(prefix="/trades", tags=["trades"])


def trade_filters(
    account: str = Query("all", pattern=r"(?i)^(all|[0-9]+)$"),
    setup: int | None = None,
    side: Direction | None = None,
    result: str | None = Query(None, pattern=r"^(win|loss|breakeven)$"),
    preset: RangeName | None = Query(None, alias="range"),
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    today: date = Depends(get_today),
) -> TradeFilters:
    """A preset range only sets the start date, so an explicit date_from wins over it."""
    chosen = resolve_account(db, user, account)
    return TradeFilters(
        account_id=chosen.id if chosen else None,
        setup_id=setup,
        side=side,
        result=result,
        date_from=date_from or range_start(preset, today),
        date_to=date_to,
        q=q.strip() if q and q.strip() else None,
    )


@router.post("", response_model=TradeDetailOut, status_code=status.HTTP_201_CREATED)
def create_trade(
    body: TradeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: Storage = Depends(get_storage),
) -> TradeDetailOut:
    return build_detail(db, save_trade(db, user, body), user, storage)


@router.get("", response_model=TradeListOut)
def list_ledger(
    filters: TradeFilters = Depends(trade_filters),
    sort_by: SortField = "closed_at",
    order: Order = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TradeListOut:
    items, total = list_trades(db, user, filters, sort_by, order, page, page_size)
    return TradeListOut(items=items, total=total, page=page, page_size=page_size)


# Declared before /{trade_id} so "export.csv" is not read as an id.
@router.get("/export.csv")
def export_ledger(
    filters: TradeFilters = Depends(trade_filters),
    sort_by: SortField = "closed_at",
    order: Order = "desc",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    body = trades_csv(all_trades(db, user, filters, sort_by, order))
    return Response(
        body, media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="trades.csv"'}
    )


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
