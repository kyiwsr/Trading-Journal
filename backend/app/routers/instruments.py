from fastapi import APIRouter, Depends, status
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app import crud
from app.db import get_db
from app.deps import get_current_user, get_owned
from app.models import Instrument, Trade, User
from app.schemas.account import InstrumentCreate, InstrumentOut, InstrumentUpdate

router = APIRouter(prefix="/instruments", tags=["instruments"])

DUPLICATE_SYMBOL = "You already have an instrument with this symbol"


@router.get("", response_model=list[InstrumentOut])
def list_instruments(
    include_archived: bool = False, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Instrument]:
    return crud.list_owned(db, Instrument, user, include_archived)


@router.post("", response_model=InstrumentOut, status_code=status.HTTP_201_CREATED)
def create_instrument(
    body: InstrumentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Instrument:
    instrument = Instrument(user_id=user.id, **body.model_dump())
    db.add(instrument)
    crud.commit(db, DUPLICATE_SYMBOL)
    return instrument


@router.get("/{instrument_id}", response_model=InstrumentOut)
def get_instrument(instrument_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Instrument:
    return get_owned(db, Instrument, instrument_id, user)


@router.patch("/{instrument_id}", response_model=InstrumentOut)
def update_instrument(
    instrument_id: int, body: InstrumentUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Instrument:
    instrument = get_owned(db, Instrument, instrument_id, user)
    crud.apply_changes(instrument, body.changes())
    crud.commit(db, DUPLICATE_SYMBOL)
    return instrument


@router.post("/{instrument_id}/archive", response_model=InstrumentOut)
def archive_instrument(instrument_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Instrument:
    return crud.set_archived(db, get_owned(db, Instrument, instrument_id, user), True)


@router.post("/{instrument_id}/unarchive", response_model=InstrumentOut)
def unarchive_instrument(instrument_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Instrument:
    return crud.set_archived(db, get_owned(db, Instrument, instrument_id, user), False)


@router.delete("/{instrument_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_instrument(instrument_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    instrument = get_owned(db, Instrument, instrument_id, user)
    has_trades = db.scalar(select(exists().where(Trade.instrument_id == instrument.id)))
    crud.delete_unless_referenced(db, instrument, has_trades, "instrument")
