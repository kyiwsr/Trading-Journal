from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import crud
from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.settings import BandsOut, SettingsIn, SettingsOut
from app.services import constants

router = APIRouter(prefix="/settings", tags=["settings"])


def _settings_out(user: User) -> SettingsOut:
    return SettingsOut(
        compliance_cutoff=user.compliance_cutoff,
        has_seen_tour=user.has_seen_tour,
        bands=BandsOut(
            elite_min=constants.ELITE_MIN_SCORE,
            solid_min=constants.SOLID_MIN_SCORE,
            sub_optimal_min=constants.SUB_OPTIMAL_MIN_SCORE,
        ),
        low_sample_threshold=constants.LOW_SAMPLE_BELOW_TRADES,
        elite_setup_min=constants.SETUP_ELITE_MIN_AVG_SCORE,
    )


@router.get("", response_model=SettingsOut)
def read_settings(user: User = Depends(get_current_user)) -> SettingsOut:
    return _settings_out(user)


@router.put("", response_model=SettingsOut)
def update_settings(
    body: SettingsIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SettingsOut:
    user.compliance_cutoff = body.compliance_cutoff
    if body.has_seen_tour is not None:
        user.has_seen_tour = body.has_seen_tour
    crud.commit(db)
    return _settings_out(user)
