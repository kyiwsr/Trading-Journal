from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.base import Name, PatchSchema

Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Weight = Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=2)]


class CriterionNew(BaseModel):
    label: Label
    weight: Weight


class CriterionUpsert(CriterionNew):
    id: int | None = None


class CriterionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    weight: Decimal
    display_order: int


class SetupCreate(BaseModel):
    name: Name
    subtitle: str | None = None
    description: str | None = None
    criteria: list[CriterionNew] = Field(default_factory=list)


class SetupUpdate(PatchSchema):
    non_nullable = frozenset({"name"})

    name: Name | None = None
    subtitle: str | None = None
    description: str | None = None


class SetupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    subtitle: str | None
    description: str | None
    archived_at: datetime | None
    created_at: datetime
    criteria: list[CriterionOut]
