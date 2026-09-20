from decimal import Decimal
from typing import Annotated, ClassVar

from pydantic import BaseModel, Field, StringConstraints, model_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Money = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=4)]
PositivePrice = Annotated[Decimal, Field(gt=0, max_digits=20, decimal_places=8)]


class PatchSchema(BaseModel):
    """Partial update: only sent fields change, and required columns may not be nulled."""

    non_nullable: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def _reject_explicit_nulls(self) -> "PatchSchema":
        for field in self.model_fields_set & self.non_nullable:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self

    def changes(self) -> dict:
        return self.model_dump(exclude_unset=True)
