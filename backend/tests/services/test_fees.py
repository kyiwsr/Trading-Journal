from decimal import Decimal as D

import pytest

from app.services.fees import FeeComponent, apply_fees, total_fees
from app.services.trade_math import Fill

APEX_TARIFF = [
    FeeComponent("Exchange Fees", D("1.60"), "per_fill"),
    FeeComponent("Broker Commission", D("2.00"), "per_fill"),
    FeeComponent("NFA Regulatory Fee", D("0.06"), "per_fill"),
]

TRADE_71_FILLS = [
    Fill("entry", D("20380.25"), D("1")),
    Fill("entry", D("20377.75"), D("1")),
    Fill("exit", D("20391.00"), D("1")),
    Fill("exit", D("20397.25"), D("1")),
]

EXCHANGE_ONLY = [FeeComponent("Exchange Fees", D("1.60"), "per_fill")]
EXCHANGE_PER_CONTRACT = [FeeComponent("Exchange Fees", D("1.60"), "per_contract")]

SCALE_IN_ONE_EXIT = [
    Fill("entry", D("20000"), D("1")),
    Fill("entry", D("20010"), D("1")),
    Fill("exit", D("20020"), D("2")),
]
SCALE_IN_TWO_EXITS = [
    Fill("entry", D("20000"), D("1")),
    Fill("entry", D("20010"), D("1")),
    Fill("exit", D("20020"), D("1")),
    Fill("exit", D("20020"), D("1")),
]


def amounts(lines):
    return {line.name: line.amount for line in lines}


def test_trade_71_fee_lines_and_total():
    lines = apply_fees(APEX_TARIFF, TRADE_71_FILLS)
    assert amounts(lines) == {
        "Exchange Fees": D("6.40"),
        "Broker Commission": D("8.00"),
        "NFA Regulatory Fee": D("0.24"),
    }
    assert total_fees(lines) == D("14.64")


def test_lines_keep_component_order():
    lines = apply_fees(APEX_TARIFF, TRADE_71_FILLS)
    assert [line.name for line in lines] == [c.name for c in APEX_TARIFF]


def test_per_fill_counts_one_exit_fill_of_two_as_a_single_fill():
    assert total_fees(apply_fees(EXCHANGE_ONLY, SCALE_IN_ONE_EXIT)) == D("4.80")


def test_per_fill_counts_two_exit_fills_separately():
    assert total_fees(apply_fees(EXCHANGE_ONLY, SCALE_IN_TWO_EXITS)) == D("6.40")


@pytest.mark.parametrize("fills", [SCALE_IN_ONE_EXIT, SCALE_IN_TWO_EXITS])
def test_per_contract_ignores_how_fills_are_split(fills):
    assert total_fees(apply_fees(EXCHANGE_PER_CONTRACT, fills)) == D("6.40")


def test_per_contract_uses_fractional_quantity():
    fills = [Fill("entry", D("1.10"), D("0.5")), Fill("exit", D("1.20"), D("0.5"))]
    assert total_fees(apply_fees(EXCHANGE_PER_CONTRACT, fills)) == D("1.60")


def test_each_line_rounds_half_up_to_cents():
    component = [FeeComponent("Odd", D("0.005"), "per_fill")]
    lines = apply_fees(component, TRADE_71_FILLS[:1])
    assert lines[0].amount == D("0.01")


def test_no_components_gives_no_lines_and_zero_total():
    lines = apply_fees([], TRADE_71_FILLS)
    assert lines == []
    assert total_fees(lines) == D("0")


def test_unknown_basis_raises():
    bad = [FeeComponent("Odd", D("1"), "per_lot")]
    with pytest.raises(ValueError, match="per_lot"):
        apply_fees(bad, TRADE_71_FILLS)
