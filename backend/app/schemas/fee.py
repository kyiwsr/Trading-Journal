from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import Money, Name, PatchSchema

Basis = Literal["per_fill", "per_contract"]


class FeeComponentIn(BaseModel):
    name: Name
    amount: Money
    basis: Basis


class FeeComponentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    amount: Decimal
    basis: Basis


class FeeProfileCreate(BaseModel):
    name: Name
    notes: str | None = None
    components: list[FeeComponentIn] = Field(default_factory=list)


class FeeProfileUpdate(PatchSchema):
    non_nullable = frozenset({"name", "components"})

    name: Name | None = None
    notes: str | None = None
    components: list[FeeComponentIn] | None = None


class FeeProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    notes: str | None
    archived_at: datetime | None
    created_at: datetime
    components: list[FeeComponentOut]


class FeeTemplateComponent(BaseModel):
    name: str
    amount: Decimal
    basis: Basis


class FeeTemplateOut(BaseModel):
    id: str
    name: str
    description: str
    components: list[FeeTemplateComponent]


class FromTemplateRequest(BaseModel):
    template_id: str
    name: Name | None = None
