from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app import crud
from app.db import get_db
from app.deps import get_current_user, get_owned
from app.fee_templates import FEE_TEMPLATES, find_template
from app.models import Account, FeeComponent, FeeProfile, User
from app.schemas.fee import (
    FeeComponentIn,
    FeeProfileCreate,
    FeeProfileOut,
    FeeProfileUpdate,
    FeeTemplateOut,
    FromTemplateRequest,
)

router = APIRouter(tags=["fee profiles"])


def _components(items: list[FeeComponentIn]) -> list[FeeComponent]:
    return [FeeComponent(**item.model_dump()) for item in items]


@router.get("/fee-templates", response_model=list[FeeTemplateOut])
def list_fee_templates(_: User = Depends(get_current_user)) -> list[FeeTemplateOut]:
    return FEE_TEMPLATES


@router.get("/fee-profiles", response_model=list[FeeProfileOut])
def list_fee_profiles(
    include_archived: bool = False, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[FeeProfile]:
    return crud.list_owned(db, FeeProfile, user, include_archived)


@router.post("/fee-profiles", response_model=FeeProfileOut, status_code=status.HTTP_201_CREATED)
def create_fee_profile(
    body: FeeProfileCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> FeeProfile:
    profile = FeeProfile(user_id=user.id, name=body.name, notes=body.notes, components=_components(body.components))
    db.add(profile)
    crud.commit(db)
    return profile


@router.post("/fee-profiles/from-template", response_model=FeeProfileOut, status_code=status.HTTP_201_CREATED)
def create_fee_profile_from_template(
    body: FromTemplateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> FeeProfile:
    template = find_template(body.template_id)
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fee template not found")
    profile = FeeProfile(
        user_id=user.id,
        name=body.name or template.name,
        components=[FeeComponent(name=c.name, amount=c.amount, basis=c.basis) for c in template.components],
    )
    db.add(profile)
    crud.commit(db)
    return profile


@router.get("/fee-profiles/{profile_id}", response_model=FeeProfileOut)
def get_fee_profile(profile_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> FeeProfile:
    return get_owned(db, FeeProfile, profile_id, user)


@router.patch("/fee-profiles/{profile_id}", response_model=FeeProfileOut)
def update_fee_profile(
    profile_id: int, body: FeeProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> FeeProfile:
    profile = get_owned(db, FeeProfile, profile_id, user)
    changes = body.changes()
    if "components" in changes:
        profile.components = _components(body.components)
        del changes["components"]
    crud.apply_changes(profile, changes)
    crud.commit(db)
    return profile


@router.post("/fee-profiles/{profile_id}/archive", response_model=FeeProfileOut)
def archive_fee_profile(profile_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> FeeProfile:
    return crud.set_archived(db, get_owned(db, FeeProfile, profile_id, user), True)


@router.post("/fee-profiles/{profile_id}/unarchive", response_model=FeeProfileOut)
def unarchive_fee_profile(profile_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> FeeProfile:
    return crud.set_archived(db, get_owned(db, FeeProfile, profile_id, user), False)


@router.delete("/fee-profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fee_profile(profile_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    profile = get_owned(db, FeeProfile, profile_id, user)
    in_use = db.scalar(select(exists().where(Account.fee_profile_id == profile.id)))
    crud.delete_unless_referenced(db, profile, in_use, "fee profile")
