from decimal import Decimal as D

import pytest

from app.services.scoring import Band, CriterionResult, compliance, execution_score, is_compliant, score_band


def results(*pairs: tuple[str, bool]) -> list[CriterionResult]:
    return [CriterionResult(D(weight), checked) for weight, checked in pairs]


class TestExecutionScore:
    def test_mockup_trade_71_scores_85(self):
        criteria = results(
            ("25", True), ("25", True), ("20", True), ("15", False), ("15", True)
        )
        assert execution_score(criteria) == 85

    def test_all_checked_is_100(self):
        assert execution_score(results(("25", True), ("75", True))) == 100

    def test_nothing_checked_is_0(self):
        assert execution_score(results(("25", False), ("75", False))) == 0

    def test_score_is_normalised_not_raw_points(self):
        assert execution_score(results(("25", True), ("25", False))) == 50

    def test_half_rounds_up(self):
        criteria = results(*[("1", i == 0) for i in range(8)])
        assert execution_score(criteria) == 13

    def test_no_criteria_gives_none(self):
        assert execution_score([]) is None

    def test_zero_total_weight_gives_none(self):
        assert execution_score(results(("0", True))) is None


class TestScoreBand:
    @pytest.mark.parametrize(
        ("score", "band"),
        [
            (100, Band.ELITE),
            (85, Band.ELITE),
            (84, Band.SOLID),
            (70, Band.SOLID),
            (69, Band.SUB_OPTIMAL),
            (60, Band.SUB_OPTIMAL),
            (59, Band.RULE_BREACH),
            (0, Band.RULE_BREACH),
        ],
    )
    def test_edges(self, score, band):
        assert score_band(score) is band

    def test_unscored_trade_has_no_band(self):
        assert score_band(None) is None


class TestIsCompliant:
    def test_default_cutoff_is_80(self):
        assert is_compliant(80)
        assert not is_compliant(79)

    def test_custom_cutoff(self):
        assert not is_compliant(85, cutoff=90)
        assert is_compliant(90, cutoff=90)

    def test_unscored_trade_is_not_compliant(self):
        assert not is_compliant(None)


class TestCompliance:
    def test_scored_trade_is_judged_against_the_cutoff(self):
        assert compliance(85, cutoff=85) is True
        assert compliance(84, cutoff=85) is False

    def test_unscored_trade_has_no_verdict(self):
        assert compliance(None, cutoff=80) is None
