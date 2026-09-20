from decimal import Decimal as D

import pytest

from app.services.xp import LevelProgress, level_progress, win_streak, xp_for_trade


class TestXpForTrade:
    def test_equals_execution_score(self):
        assert xp_for_trade(85) == 85

    def test_unscored_trade_earns_nothing(self):
        assert xp_for_trade(None) == 0

    def test_zero_score_earns_nothing(self):
        assert xp_for_trade(0) == 0


class TestLevelProgress:
    def test_mockup_hud_8420_is_level_1(self):
        assert level_progress(8420) == LevelProgress(level=1, xp_in_level=8420, xp_per_level=10_000)

    def test_zero_xp_is_level_1(self):
        assert level_progress(0) == LevelProgress(1, 0, 10_000)

    def test_last_xp_before_level_up(self):
        assert level_progress(9_999) == LevelProgress(1, 9_999, 10_000)

    def test_exact_boundary_starts_level_2(self):
        assert level_progress(10_000) == LevelProgress(2, 0, 10_000)

    def test_carries_remainder_into_next_level(self):
        assert level_progress(25_000) == LevelProgress(3, 5_000, 10_000)

    def test_negative_total_raises(self):
        with pytest.raises(ValueError, match="negative"):
            level_progress(-1)


class TestWinStreak:
    def test_counts_trailing_wins(self):
        assert win_streak([D("-10"), D("5"), D("20"), D("1")]) == 3

    def test_last_loss_ends_streak_at_zero(self):
        assert win_streak([D("5"), D("-1")]) == 0

    def test_breakeven_breaks_the_streak(self):
        assert win_streak([D("5"), D("0"), D("3")]) == 1

    def test_all_wins(self):
        assert win_streak([D("1"), D("2"), D("3")]) == 3

    def test_empty_history(self):
        assert win_streak([]) == 0

    def test_single_win_and_single_loss(self):
        assert win_streak([D("1")]) == 1
        assert win_streak([D("-1")]) == 0
