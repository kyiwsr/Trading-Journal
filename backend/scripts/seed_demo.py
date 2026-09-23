"""Load demo data: one account, two instruments, four setups and 90 generated trades.

Run from backend/: python -m scripts.seed_demo [--reset] [--email you@example.com] [--end 2026-09-18]

Every trade goes through save_trade, the same path as POST /trades. The data is generated from a fixed
seed, so the same --end date always produces the same journal. It is illustrative, not a market record.
"""

import argparse
import os
import random
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_EVEN, Decimal

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Account, FeeComponent, FeeProfile, Instrument, Setup, SetupCriterion, Trade, User
from app.schemas.trade import CriterionCheckIn, FillIn, TradeIn
from app.trade_write import delete_trade, save_trade

SEED = 2026
TRADE_COUNT = 90
HISTORY_DAYS = 260
DEMO_NOTE = "Demo data from scripts.seed_demo."
ACCOUNT_NAME = "Apex 150k"
ACCOUNT_LABEL = "#APX-9821"
STARTING_BALANCE = Decimal("150000")
TARIFF_NAME = "Example prop-firm tariff"
TARIFF = [("Exchange fees", "1.60"), ("Broker commission", "2.00"), ("Regulatory fee", "0.06")]

# symbol: (name, tick size, tick value, share of trades, base price, drift per weekday, noise, stop points)
INSTRUMENTS = {
    "NQ": ("E-mini Nasdaq-100 (demo)", "0.25", "5.00", 75, 19000.0, 4.0, 40.0, (5.0, 14.0)),
    "ES": ("E-mini S&P 500 (demo)", "0.25", "12.50", 25, 5400.0, 1.0, 10.0, (2.0, 5.0)),
}

# (name, window start UTC, minutes the window lasts, share of trades)
SESSIONS = [
    ("NY open", time(13, 30), 60, 35),
    ("NY AM", time(14, 30), 90, 35),
    ("NY midday", time(16, 0), 120, 20),
    ("Pre-close", time(19, 0), 60, 10),
]
TAGS = ["London sweep", "5m MSS", "Runner", "Trend day", "News"]
FOCUS = ["Calm, zero tilt", "Rested", "Rushed after a loss", "Distracted"]
DEBRIEF_WIN = ["Followed the plan.", "Waited for the retest.", "Scaled out at the first target."]
DEBRIEF_LOSS = ["Chased the entry.", "Stop was hit before the setup played out.", "Sized up after a win."]


@dataclass(frozen=True)
class SetupSpec:
    name: str
    subtitle: str
    share: int
    win_rate: float
    discipline: float
    criteria: tuple[tuple[str, int], ...]


SETUPS = [
    SetupSpec(
        "celup kaki",
        "Liquidity Sweep Scalp",
        34,
        0.76,
        0.92,
        (
            ("Wait for the Asian or London low liquidity sweep", 25),
            ("5m market structure shift with displacement", 25),
            ("Stop placed before the order", 20),
            ("Wait for the 50% fibonacci retest", 15),
            ("Scale out 50% at internal liquidity, stop to breakeven", 15),
        ),
    ),
    SetupSpec(
        "hulur kepala",
        "Opening Drive Fade",
        22,
        0.62,
        0.85,
        (
            ("Opening range marked before the bell", 20),
            ("Drive extends past the prior day range", 25),
            ("Fade entry on the first failed retest", 25),
            ("Stop above the drive extreme", 15),
            ("Target at the opening range midpoint", 15),
        ),
    ),
    SetupSpec(
        "FVG Retest & Continuation",
        "Fair Value Gap",
        18,
        0.60,
        0.86,
        (
            ("Fair value gap formed on the 5m with displacement", 30),
            ("Retest into the gap, not through it", 25),
            ("Higher-timeframe bias agrees", 20),
            ("Stop beyond the gap", 15),
            ("Partial at the prior high or low", 10),
        ),
    ),
    SetupSpec(
        "FOMC News Spike",
        "Event Breakout",
        14,
        0.36,
        0.55,
        (
            ("Event time and expected volatility noted", 20),
            ("No entry in the first 60 seconds", 25),
            ("Size cut to half", 25),
            ("Stop set before entry", 20),
            ("Out within five minutes", 10),
        ),
    ),
]


@dataclass
class Book:
    """The rows trades are attached to, found or created before any trade is generated."""

    account: Account
    instruments: dict[str, Instrument]
    setups: dict[str, Setup]


def _tick(price: float, tick_size: Decimal) -> Decimal:
    return (Decimal(str(price)) / tick_size).quantize(Decimal(1), rounding=ROUND_HALF_EVEN) * tick_size


def _split(rng: random.Random, quantity: int, parts: int) -> list[int]:
    sizes = [1] * parts
    for _ in range(quantity - parts):
        sizes[rng.randrange(parts)] += 1
    return sizes


def _fill_prices(center: float, sizes: list[int], spread: float, tick_size: Decimal) -> list[Decimal]:
    """Prices spread around `center` whose size-weighted average stays on it (before tick rounding)."""
    raw = [spread * (i - (len(sizes) - 1) / 2) for i in range(len(sizes))]
    shift = sum(q * r for q, r in zip(sizes, raw)) / sum(sizes)
    return [_tick(center + r - shift, tick_size) for r in raw]


def _average(prices: list[Decimal], sizes: list[int]) -> float:
    return float(sum(p * q for p, q in zip(prices, sizes)) / sum(sizes))


def _find_or_create_book(db: Session, user: User) -> Book:
    profile = db.scalar(select(FeeProfile).where(FeeProfile.user_id == user.id, FeeProfile.name == TARIFF_NAME))
    if profile is None:
        profile = FeeProfile(
            user_id=user.id,
            name=TARIFF_NAME,
            notes="Demo data: example rates, not a real broker tariff.",
            components=[FeeComponent(name=n, amount=Decimal(a), basis="per_fill") for n, a in TARIFF],
        )
        db.add(profile)
        db.flush()

    account = db.scalar(
        select(Account).where(Account.user_id == user.id, Account.name == ACCOUNT_NAME, Account.label == ACCOUNT_LABEL)
    )
    if account is None:
        account = Account(
            user_id=user.id,
            name=ACCOUNT_NAME,
            label=ACCOUNT_LABEL,
            starting_balance=STARTING_BALANCE,
            fee_profile_id=profile.id,
        )
        db.add(account)

    instruments = {}
    for symbol, (name, size, value, *_rest) in INSTRUMENTS.items():
        instrument = db.scalar(select(Instrument).where(Instrument.user_id == user.id, Instrument.symbol == symbol))
        if instrument is None:
            instrument = Instrument(
                user_id=user.id, symbol=symbol, name=name, tick_size=Decimal(size), tick_value=Decimal(value)
            )
            db.add(instrument)
        instruments[symbol] = instrument

    setups = {}
    for spec in SETUPS:
        setup = db.scalar(select(Setup).where(Setup.user_id == user.id, Setup.name == spec.name))
        if setup is None:
            setup = Setup(
                user_id=user.id,
                name=spec.name,
                subtitle=spec.subtitle,
                description=DEMO_NOTE,
                criteria=[
                    SetupCriterion(label=label, weight=Decimal(weight), display_order=order)
                    for order, (label, weight) in enumerate(spec.criteria)
                ],
            )
            db.add(setup)
        setups[spec.name] = setup
    db.commit()
    return Book(account, instruments, setups)


def _trade(rng: random.Random, book: Book, when: date, day_index: int) -> TradeIn:
    spec = rng.choices(SETUPS, weights=[s.share for s in SETUPS])[0]
    symbol = rng.choices(list(INSTRUMENTS), weights=[v[3] for v in INSTRUMENTS.values()])[0]
    _, size, _, _, base, drift, noise, (stop_low, stop_high) = INSTRUMENTS[symbol]
    tick_size = Decimal(size)
    direction = rng.choice(["long", "short"])
    sign = 1 if direction == "long" else -1
    quantity = rng.choices([1, 2, 3, 4, 6], weights=[30, 30, 20, 10, 10])[0]
    entry_sizes = _split(rng, quantity, min(quantity, rng.choices([1, 2, 3], weights=[60, 30, 10])[0]))
    exit_sizes = _split(rng, quantity, min(quantity, rng.choices([1, 2, 3], weights=[55, 35, 10])[0]))

    entry_center = base + day_index * drift + rng.uniform(-noise, noise)
    stop_points = float(_tick(rng.uniform(stop_low, stop_high), tick_size))
    won = rng.random() < spec.win_rate
    result_r = rng.uniform(0.8, 3.2) if won else -rng.uniform(0.7, 1.2)

    entry_prices = _fill_prices(entry_center, entry_sizes, stop_points * 0.15, tick_size)
    avg_entry = _average(entry_prices, entry_sizes)
    exit_prices = _fill_prices(avg_entry + sign * result_r * stop_points, exit_sizes, stop_points * 0.4, tick_size)
    stop_price = _tick(avg_entry - sign * stop_points, tick_size)

    session, window_start, window_minutes, _ = rng.choices(SESSIONS, weights=[s[3] for s in SESSIONS])[0]
    opened = datetime.combine(when, window_start, tzinfo=timezone.utc) + timedelta(
        seconds=rng.randrange(window_minutes * 60)
    )
    moment = opened
    fills = []
    for price, qty in zip(entry_prices, entry_sizes):
        fills.append(FillIn(fill_type="entry", price=price, quantity=Decimal(qty), filled_at=moment))
        moment += timedelta(seconds=rng.randrange(20, 90))
    moment += timedelta(seconds=rng.randrange(120, 2400))
    for price, qty in zip(exit_prices, exit_sizes):
        fills.append(FillIn(fill_type="exit", price=price, quantity=Decimal(qty), filled_at=moment))
        moment += timedelta(seconds=rng.randrange(30, 600))

    setup = book.setups[spec.name]
    checked_odds = min(0.98, max(0.05, spec.discipline + (0.04 if won else -0.06)))
    checks = [
        CriterionCheckIn(criterion_id=c.id, checked=rng.random() < checked_odds) for c in setup.criteria
    ]
    return TradeIn(
        account_id=book.account.id,
        instrument_id=book.instruments[symbol].id,
        setup_id=setup.id,
        direction=direction,
        session=session,
        tags=rng.sample(TAGS, rng.choice([0, 0, 1, 2])),
        stop_price=stop_price,
        fills=fills,
        criteria_checks=checks,
        pre_trade_focus=rng.choice(FOCUS) if rng.random() < 0.5 else None,
        debrief_notes=rng.choice(DEBRIEF_WIN if won else DEBRIEF_LOSS) if rng.random() < 0.4 else None,
    )


def _weekdays(end: date) -> list[date]:
    days = [end - timedelta(days=n) for n in range(HISTORY_DAYS, -1, -1)]
    return [d for d in days if d.weekday() < 5]


def reset_demo(db: Session, user: User) -> None:
    """Remove the demo account and its trades, then any demo rows nothing else uses; your own rows stay."""
    account = db.scalar(
        select(Account).where(Account.user_id == user.id, Account.name == ACCOUNT_NAME, Account.label == ACCOUNT_LABEL)
    )
    if account is not None:
        for trade in db.scalars(select(Trade).where(Trade.account_id == account.id)).all():
            delete_trade(db, trade)
        db.delete(account)
        db.commit()

    for setup in db.scalars(select(Setup).where(Setup.user_id == user.id, Setup.description == DEMO_NOTE)):
        if not db.scalar(select(exists().where(Trade.setup_id == setup.id))):
            db.delete(setup)
    for instrument in db.scalars(select(Instrument).where(Instrument.user_id == user.id)):
        if instrument.name and instrument.name.endswith("(demo)"):
            if not db.scalar(select(exists().where(Trade.instrument_id == instrument.id))):
                db.delete(instrument)
    for profile in db.scalars(select(FeeProfile).where(FeeProfile.user_id == user.id, FeeProfile.name == TARIFF_NAME)):
        if not db.scalar(select(exists().where(Account.fee_profile_id == profile.id))):
            db.delete(profile)
    db.commit()


def seed_demo(db: Session, user: User, end: date, reset: bool = False) -> int:
    if reset:
        reset_demo(db, user)
    elif db.scalar(
        select(exists().where(Account.user_id == user.id, Account.name == ACCOUNT_NAME, Account.label == ACCOUNT_LABEL))
    ):
        raise SystemExit("The demo account already exists; pass --reset to replace it")

    book = _find_or_create_book(db, user)
    rng = random.Random(SEED)
    days = _weekdays(end)
    picked = sorted(rng.choices(range(len(days)), k=TRADE_COUNT))
    for day_index in picked:
        save_trade(db, user, _trade(rng, book, days[day_index], day_index))
    return TRADE_COUNT


def _resolve_user(db: Session, email: str | None) -> User:
    if email:
        user = db.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            raise SystemExit(f"No user with email {email}; create one with python -m scripts.seed_user")
        return user
    users = db.scalars(select(User)).all()
    if len(users) != 1:
        raise SystemExit("Pass --email (or set SEED_EMAIL): there is not exactly one user")
    return users[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--reset", action="store_true", help="replace an existing demo account")
    parser.add_argument("--email", default=os.environ.get("SEED_EMAIL"))
    parser.add_argument("--end", type=date.fromisoformat, default=datetime.now(timezone.utc).date())
    args = parser.parse_args()
    with SessionLocal() as db:
        count = seed_demo(db, _resolve_user(db, args.email), args.end, args.reset)
    print(f"seeded {count} demo trades ending {args.end}")


if __name__ == "__main__":
    main()
