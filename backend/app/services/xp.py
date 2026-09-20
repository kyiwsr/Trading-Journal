from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from app.services.constants import XP_PER_LEVEL


@dataclass(frozen=True)
class LevelProgress:
    level: int
    xp_in_level: int
    xp_per_level: int


def xp_for_trade(execution_score: int | None) -> int:
    return execution_score or 0


def level_progress(total_xp: int) -> LevelProgress:
    if total_xp < 0:
        raise ValueError(f"total_xp cannot be negative, got {total_xp}")
    level, xp_in_level = divmod(total_xp, XP_PER_LEVEL)
    return LevelProgress(level + 1, xp_in_level, XP_PER_LEVEL)


def win_streak(net_pnls_oldest_first: Sequence[Decimal]) -> int:
    streak = 0
    for pnl in reversed(net_pnls_oldest_first):
        if pnl <= 0:
            break
        streak += 1
    return streak
