from decimal import Decimal as D

import pytest

from app.services.rounding import round_half_up, to_cents


@pytest.mark.parametrize(
    ("value", "places", "expected"),
    [
        ("0.125", 2, "0.13"),
        ("-1.025", 2, "-1.03"),
        ("12.5", 0, "13"),
        ("63.636", 1, "63.6"),
    ],
)
def test_ties_round_away_from_zero(value, places, expected):
    assert round_half_up(D(value), places) == D(expected)


def test_tiny_negative_value_does_not_become_negative_zero():
    assert str(round_half_up(D("-0.002"), 2)) == "0.00"


def test_to_cents_keeps_two_places():
    assert str(to_cents(D("605"))) == "605.00"
