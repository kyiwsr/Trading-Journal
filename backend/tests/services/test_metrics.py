from datetime import datetime, timedelta
from decimal import Decimal as D

import pytest

from app.services.metrics import (
    SetupRank,
    TradeRow,
    discipline_report,
    equity_curve,
    setup_table,
    summarize,
)
from app.services.scoring import Band

T0 = datetime(2026, 9, 1, 9, 30)


def trade(
    net: str,
    day: int = 0,
    gross: str | None = None,
    fees: str = "0",
    r: str | None = None,
    score: int | None = None,
    setup_id: int | None = None,
    setup_name: str | None = None,
) -> TradeRow:
    return TradeRow(
        closed_at=T0 + timedelta(days=day),
        gross_pnl=D(gross if gross is not None else net),
        fees_total=D(fees),
        net_pnl=D(net),
        r_multiple=D(r) if r is not None else None,
        execution_score=score,
        setup_id=setup_id,
        setup_name=setup_name,
    )


FIVE_TRADES = [
    trade("100", 0, gross="110", fees="10", r="2.00", score=90),
    trade("-50", 1, gross="-45", fees="5", r="-1.00", score=55),
    trade("200", 2, gross="205", fees="5", r="2.50", score=95),
    trade("0", 3, gross="5", fees="5", r="0.00", score=80),
    trade("-25", 4, gross="-20", fees="5", r=None, score=None),
]


class TestSummarize:
    def test_five_trade_mix(self):
        s = summarize(FIVE_TRADES, starting_balance=D("10000"))
        assert (s.trade_count, s.wins, s.losses, s.breakevens) == (5, 2, 2, 1)
        assert s.net_pnl == D("225")
        assert s.gross_pnl == D("255")
        assert s.fees_total == D("30")
        assert s.gross_profits == D("300")
        assert s.gross_losses == D("75")
        assert s.profit_factor == D("4.00")
        assert s.win_rate == D("40.0")
        assert s.expectancy == D("0.88")
        assert s.total_r == D("3.50")
        assert s.avg_execution_score == D("80.0")
        assert s.return_pct == D("2.25")

    def test_empty_input_has_no_ratios_and_no_division_error(self):
        s = summarize([], starting_balance=D("10000"))
        assert s.trade_count == 0
        assert s.net_pnl == D("0")
        assert s.profit_factor is None
        assert s.win_rate is None
        assert s.expectancy is None
        assert s.total_r == D("0")
        assert s.avg_execution_score is None
        assert s.return_pct == D("0.00")

    def test_single_winning_trade(self):
        s = summarize([trade("50", r="1.50", score=100)], D("1000"))
        assert s.win_rate == D("100.0")
        assert s.expectancy == D("1.50")
        assert s.return_pct == D("5.00")

    def test_no_losing_trades_leaves_profit_factor_undefined(self):
        s = summarize([trade("50"), trade("10", 1)], D("1000"))
        assert s.gross_losses == D("0")
        assert s.profit_factor is None

    def test_only_losing_trades_gives_zero_profit_factor(self):
        s = summarize([trade("-50")], D("1000"))
        assert s.profit_factor == D("0.00")
        assert s.win_rate == D("0.0")

    def test_zero_starting_balance_has_no_return_pct(self):
        assert summarize([trade("50")], D("0")).return_pct is None

    def test_trades_without_r_are_left_out_of_expectancy(self):
        s = summarize([trade("50", r="2.00"), trade("-10", 1)], D("1000"))
        assert s.expectancy == D("2.00")


class TestEquityCurve:
    def test_peak_current_and_max_drawdown(self):
        trades = [
            trade("-300", 3),
            trade("200", 0),
            trade("100", 4),
            trade("-100", 1),
            trade("50", 2),
        ]
        curve = equity_curve(trades, D("1000"))
        assert [p.equity for p in curve.points] == [
            D("1200"),
            D("1100"),
            D("1150"),
            D("850"),
            D("950"),
        ]
        assert curve.peak == D("1200")
        assert curve.current == D("950")
        assert curve.drawdown_amount == D("250")
        assert curve.drawdown_pct == D("20.83")
        assert curve.max_drawdown_pct == D("29.17")

    def test_points_are_ordered_by_close_time(self):
        curve = equity_curve([trade("10", 2), trade("5", 1)], D("0"))
        assert [p.closed_at for p in curve.points] == [T0 + timedelta(days=1), T0 + timedelta(days=2)]

    def test_starting_balance_counts_as_the_peak(self):
        curve = equity_curve([trade("-100")], D("1000"))
        assert curve.peak == D("1000")
        assert curve.drawdown_amount == D("100")
        assert curve.drawdown_pct == D("10.00")
        assert curve.max_drawdown_pct == D("10.00")

    def test_mockup_hud_numbers(self):
        curve = equity_curve([trade("17800", 0), trade("-3519.50", 1)], D("150000"))
        assert curve.peak == D("167800")
        assert curve.current == D("164280.50")
        assert curve.drawdown_amount == D("3519.50")
        assert curve.drawdown_pct == D("2.10")

    def test_empty_curve_sits_at_the_starting_balance(self):
        curve = equity_curve([], D("5000"))
        assert curve.points == []
        assert curve.peak == curve.current == D("5000")
        assert curve.drawdown_amount == D("0")
        assert curve.drawdown_pct == D("0.00")
        assert curve.max_drawdown_pct == D("0.00")

    def test_zero_peak_reports_zero_percent_drawdown(self):
        curve = equity_curve([trade("-50")], D("0"))
        assert curve.drawdown_amount == D("50")
        assert curve.drawdown_pct == D("0.00")

    def test_always_rising_curve_has_no_drawdown(self):
        curve = equity_curve([trade("10", 0), trade("10", 1)], D("100"))
        assert curve.drawdown_amount == D("0")
        assert curve.max_drawdown_pct == D("0.00")


DISCIPLINE_TRADES = [
    trade("100", 0, r="2.00", score=90),
    trade("-20", 1, r="-0.50", score=85),
    trade("50", 2, r="1.00", score=75),
    trade("10", 3, score=65),
    trade("-100", 4, r="-1.00", score=40),
    trade("-50", 5, r="-0.50", score=30),
    trade("999", 6, score=None),
]


class TestDisciplineReport:
    def test_buckets_follow_band_order(self):
        report = discipline_report(DISCIPLINE_TRADES)
        assert [b.band for b in report.buckets] == [
            Band.ELITE,
            Band.SOLID,
            Band.SUB_OPTIMAL,
            Band.RULE_BREACH,
        ]

    def test_bucket_figures(self):
        elite, solid, sub, breach = discipline_report(DISCIPLINE_TRADES).buckets
        assert (elite.trade_count, elite.win_rate, elite.net_pnl, elite.avg_r) == (
            2,
            D("50.0"),
            D("80"),
            D("0.75"),
        )
        assert (solid.trade_count, solid.win_rate, solid.net_pnl, solid.avg_r) == (
            1,
            D("100.0"),
            D("50"),
            D("1.00"),
        )
        assert (sub.trade_count, sub.win_rate, sub.net_pnl, sub.avg_r) == (
            1,
            D("100.0"),
            D("10"),
            None,
        )
        assert (breach.trade_count, breach.win_rate, breach.net_pnl, breach.avg_r) == (
            2,
            D("0.0"),
            D("-150"),
            D("-0.75"),
        )

    def test_unscored_trades_are_left_out(self):
        report = discipline_report(DISCIPLINE_TRADES)
        assert sum(b.trade_count for b in report.buckets) == 6

    def test_saved_capital_is_the_avoided_rule_breach_loss(self):
        assert discipline_report(DISCIPLINE_TRADES).saved_capital == D("150")

    def test_profitable_rule_breaches_save_nothing(self):
        assert discipline_report([trade("40", score=30)]).saved_capital == D("0")

    def test_empty_input_gives_four_empty_buckets(self):
        report = discipline_report([])
        assert len(report.buckets) == 4
        assert all(b.trade_count == 0 and b.win_rate is None for b in report.buckets)
        assert report.saved_capital == D("0")


def setup_trades(setup_id, name, count, net="100", r=None, score=None, start_day=0):
    return [
        trade(net, start_day + i, r=r, score=score, setup_id=setup_id, setup_name=name)
        for i in range(count)
    ]


class TestSetupTable:
    def test_rows_rank_and_order(self):
        trades = (
            setup_trades(1, "celup kaki", 3, r="1.00", score=95)
            + setup_trades(2, "hulur kepala", 2, r="0.50", score=80)
            + setup_trades(3, "FOMC News Spike", 2, net="-50", r="-0.75", score=95)
            + [trade("500", 99)]
        )
        rows = setup_table(trades)
        assert [r.name for r in rows] == ["celup kaki", "FOMC News Spike", "hulur kepala"]
        celup, fomc, hulur = rows
        assert celup.rank is SetupRank.ELITE
        assert hulur.rank is SetupRank.SOLID
        assert fomc.rank is SetupRank.NEGATIVE_EDGE
        assert (celup.trade_count, celup.win_rate, celup.net_pnl) == (3, D("100.0"), D("300"))
        assert (celup.expectancy, celup.avg_execution_score) == (D("1.00"), D("95.0"))
        assert fomc.net_pnl == D("-100")

    def test_trades_without_a_setup_are_excluded(self):
        assert setup_table([trade("500")]) == []

    @pytest.mark.parametrize(("count", "low"), [(19, True), (20, False)])
    def test_low_sample_flag_boundary(self, count, low):
        rows = setup_table(setup_trades(1, "a", count, r="1.00", score=95))
        assert rows[0].low_sample is low

    def test_missing_expectancy_is_not_a_negative_edge(self):
        row = setup_table(setup_trades(1, "a", 2, score=95))[0]
        assert row.expectancy is None
        assert row.rank is SetupRank.ELITE

    def test_missing_scores_rank_solid(self):
        row = setup_table(setup_trades(1, "a", 2, r="1.00"))[0]
        assert row.avg_execution_score is None
        assert row.rank is SetupRank.SOLID

    def test_zero_expectancy_falls_through_to_score(self):
        row = setup_table(setup_trades(1, "a", 2, r="0.00", score=95))[0]
        assert row.rank is SetupRank.ELITE

    def test_average_score_of_exactly_90_is_elite(self):
        row = setup_table(setup_trades(1, "a", 2, r="1.00", score=90))[0]
        assert row.rank is SetupRank.ELITE

    def test_average_score_just_under_90_is_solid(self):
        trades = setup_trades(1, "a", 1, r="1.00", score=90) + setup_trades(
            1, "a", 1, r="1.00", score=89, start_day=5
        )
        row = setup_table(trades)[0]
        assert row.avg_execution_score == D("89.5")
        assert row.rank is SetupRank.SOLID

    def test_rank_uses_the_unrounded_expectancy(self):
        trades = setup_trades(1, "a", 1, r="-0.004", score=95) + setup_trades(
            1, "a", 1, r="0.000", score=95, start_day=5
        )
        row = setup_table(trades)[0]
        assert row.expectancy == D("0.00")
        assert row.rank is SetupRank.NEGATIVE_EDGE
