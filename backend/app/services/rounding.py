from decimal import ROUND_HALF_UP, Decimal


def round_half_up(value: Decimal, places: int) -> Decimal:
    # Ties go away from zero (-1.025 -> -1.03), unlike Python's round().
    return value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)


def to_cents(value: Decimal) -> Decimal:
    return round_half_up(value, 2)
