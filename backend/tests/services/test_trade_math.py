from decimal import Decimal as D

import pytest

from app.services.trade_math import (
    Fill,
    Instrument,
    average_price,
    compute_trade,
    exit_realized,
    slippage_cost,
)

NQ = Instrument(tick_size=D("0.25"), tick_value=D("5.00"))


def entry(price: str, qty: str = "1") -> Fill:
    return Fill("entry", D(price), D(qty))


def exit_(price: str, qty: str = "1") -> Fill:
    return Fill("exit", D(price), D(qty))


TRADE_71 = [
    entry("20380.25"),
    entry("20377.75"),
    exit_("20391.00"),
    exit_("20397.25"),
]


class TestAveragePrice:
    def test_equal_sizes(self):
        assert average_price(TRADE_71, "entry") == D("20379.00")
        assert average_price(TRADE_71, "exit") == D("20394.125")

    def test_weighted_by_quantity(self):
        fills = [entry("20000", "1"), entry("20008", "3")]
        assert average_price(fills, "entry") == D("20006")

    def test_no_fills_of_type_raises(self):
        with pytest.raises(ValueError, match="exit"):
            average_price([entry("20000")], "exit")


class TestFill:
    @pytest.mark.parametrize("qty", ["0", "-1"])
    def test_non_positive_quantity_raises(self, qty):
        with pytest.raises(ValueError, match="quantity"):
            entry("20000", qty)


class TestComputeTrade:
    def test_trade_71(self):
        result = compute_trade(
            "long",
            TRADE_71,
            NQ,
            stop_price=D("20372.75"),
            fees_total=D("14.64"),
        )
        assert result.quantity == D("2")
        assert result.avg_entry == D("20379.00")
        assert result.avg_exit == D("20394.125")
        assert result.points == D("15.125")
        assert result.gross_pnl == D("605.00")
        assert result.risk_amount == D("250.00")
        assert result.net_pnl == D("590.36")
        assert result.r_multiple == D("2.36")

    def test_scale_in_single_exit_fill(self):
        fills = [entry("20000.00"), entry("20010.00"), exit_("20020.00", "2")]
        result = compute_trade("long", fills, NQ, stop_price=D("19990.00"))
        assert result.avg_entry == D("20005.00")
        assert result.points == D("15.00")
        assert result.gross_pnl == D("600.00")
        assert result.risk_amount == D("600.00")
        assert result.r_multiple == D("1.00")

    def test_scale_in_split_exit_fills_gives_same_gross(self):
        fills = [
            entry("20000.00"),
            entry("20010.00"),
            exit_("20020.00"),
            exit_("20020.00"),
        ]
        assert compute_trade("long", fills, NQ).gross_pnl == D("600.00")

    def test_unequal_sizes(self):
        fills = [entry("20000", "1"), entry("20008", "3"), exit_("20020", "4")]
        result = compute_trade("long", fills, NQ)
        assert result.avg_entry == D("20006")
        assert result.gross_pnl == D("1120.00")

    def test_short_win(self):
        fills = [entry("20020"), exit_("20000")]
        result = compute_trade("short", fills, NQ, stop_price=D("20030"))
        assert result.points == D("20")
        assert result.gross_pnl == D("400.00")
        assert result.risk_amount == D("200.00")
        assert result.r_multiple == D("2.00")

    def test_short_loss(self):
        fills = [entry("20000"), exit_("20010")]
        assert compute_trade("short", fills, NQ).gross_pnl == D("-200.00")

    def test_long_loss_with_fees_is_negative_r(self):
        fills = [entry("20000"), exit_("19990")]
        result = compute_trade(
            "long", fills, NQ, stop_price=D("19990"), fees_total=D("5.00")
        )
        assert result.gross_pnl == D("-200.00")
        assert result.net_pnl == D("-205.00")
        assert result.r_multiple == D("-1.03")

    def test_slippage_reduces_net(self):
        fills = [entry("20000", "2"), exit_("20010", "2")]
        result = compute_trade("long", fills, NQ, slippage_ticks=D("2"))
        assert result.gross_pnl == D("400.00")
        assert result.net_pnl == D("380.00")

    def test_no_stop_gives_null_risk_and_r(self):
        result = compute_trade("long", [entry("20000"), exit_("20010")], NQ)
        assert result.risk_amount is None
        assert result.r_multiple is None

    def test_stop_at_entry_gives_zero_risk_and_null_r(self):
        result = compute_trade(
            "long", [entry("20000"), exit_("20010")], NQ, stop_price=D("20000")
        )
        assert result.risk_amount == D("0.00")
        assert result.r_multiple is None

    def test_breakeven_gross_is_zero(self):
        result = compute_trade("long", [entry("20000"), exit_("20000")], NQ)
        assert result.gross_pnl == D("0.00")
        assert result.net_pnl == D("0.00")

    def test_money_rounds_half_up_to_cents(self):
        half_cent = Instrument(tick_size=D("1"), tick_value=D("0.005"))
        result = compute_trade("long", [entry("100"), exit_("101")], half_cent)
        assert result.gross_pnl == D("0.01")

    def test_quantity_mismatch_raises(self):
        fills = [entry("20000", "2"), exit_("20010", "1")]
        with pytest.raises(ValueError, match="quantit"):
            compute_trade("long", fills, NQ)

    def test_missing_exit_raises(self):
        with pytest.raises(ValueError, match="exit"):
            compute_trade("long", [entry("20000")], NQ)

    def test_unknown_direction_raises(self):
        with pytest.raises(ValueError, match="direction"):
            compute_trade("up", [entry("20000"), exit_("20010")], NQ)


class TestExitRealized:
    def test_tp1_row_of_trade_71(self):
        realized = exit_realized("long", D("20379.00"), exit_("20391.00"), NQ)
        assert realized.points == D("12.00")
        assert realized.pnl == D("240.00")

    def test_runner_row_of_trade_71(self):
        realized = exit_realized("long", D("20379.00"), exit_("20397.25"), NQ)
        assert realized.points == D("18.25")
        assert realized.pnl == D("365.00")

    def test_multi_contract_exit(self):
        realized = exit_realized("long", D("20005.00"), exit_("20020", "2"), NQ)
        assert realized.pnl == D("600.00")

    def test_short_exit_below_entry_is_a_gain(self):
        realized = exit_realized("short", D("20020"), exit_("20000"), NQ)
        assert realized.points == D("20")
        assert realized.pnl == D("400.00")


class TestSlippageCost:
    def test_ticks_times_value_times_quantity(self):
        assert slippage_cost(D("3"), NQ, D("2")) == D("30.00")

    def test_zero_ticks(self):
        assert slippage_cost(D("0"), NQ, D("2")) == D("0.00")
