from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dashboard import build_dashboard
from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.dashboard import DashboardOut
from app.trade_queries import RangeName, get_today, resolve_account

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def read_dashboard(
    account: str = Query("all", pattern=r"(?i)^(all|[0-9]+)$"),
    range_name: RangeName = Query("ALL", alias="range"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    today: date = Depends(get_today),
) -> DashboardOut:
    return build_dashboard(db, user, resolve_account(db, user, account), range_name, today)
