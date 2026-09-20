from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Sequence

from app.services.constants import (
    DEFAULT_COMPLIANCE_CUTOFF,
    ELITE_MIN_SCORE,
    SOLID_MIN_SCORE,
    SUB_OPTIMAL_MIN_SCORE,
)
from app.services.rounding import round_half_up


class Band(str, Enum):
    ELITE = "elite"
    SOLID = "solid"
    SUB_OPTIMAL = "sub_optimal"
    RULE_BREACH = "rule_breach"


@dataclass(frozen=True)
class CriterionResult:
    weight: Decimal
    checked: bool


def execution_score(criteria: Sequence[CriterionResult]) -> int | None:
    total = sum((c.weight for c in criteria), Decimal(0))
    if total <= 0:
        return None
    checked = sum((c.weight for c in criteria if c.checked), Decimal(0))
    return int(round_half_up(100 * checked / total, 0))


def score_band(score: int | None) -> Band | None:
    if score is None:
        return None
    if score >= ELITE_MIN_SCORE:
        return Band.ELITE
    if score >= SOLID_MIN_SCORE:
        return Band.SOLID
    if score >= SUB_OPTIMAL_MIN_SCORE:
        return Band.SUB_OPTIMAL
    return Band.RULE_BREACH


def is_compliant(score: int | None, cutoff: int = DEFAULT_COMPLIANCE_CUTOFF) -> bool:
    return score is not None and score >= cutoff


def compliance(score: int | None, cutoff: int) -> bool | None:
    """None for an unscored trade, which is neither compliant nor in breach."""
    return None if score is None else score >= cutoff
