# Trading Journal — Implementation Plan

Date: 2026-09-20
Spec: `docs/superpowers/specs/2026-09-19-trading-journal-design.md` (rev 2)
Design: `design/stitch/` (3 exported screens) + Stitch project
`projects/17281297860553652085`

## Assumptions (change any of these before starting)

- Frontend is **React + Vite + plain JavaScript (JSX)**.
- Python 3.11+, PostgreSQL 16 locally via Docker Compose (or a local
  Windows install; only `DATABASE_URL` changes).
- Backend libs: FastAPI, uvicorn, SQLAlchemy 2, Alembic, psycopg 3,
  pydantic v2, passlib/argon2 (or bcrypt), PyJWT, supabase-py (Storage
  only), pytest, httpx.
- Frontend libs: react-router, TanStack Query, Recharts, Vitest,
  Testing Library. No UI kit — components are built from the design
  tokens.
- Money and prices use `Decimal` / Postgres `NUMERIC`, never floats.
- Working style: every task ends with a verification you can run.
  Domain logic is test-first. No feature beyond the spec.

## Repo layout

```
Trading-Journal/
  backend/
    app/{main,config,db,security,deps}.py
    app/models/        SQLAlchemy tables (spec §3)
    app/schemas/       pydantic request/response models
    app/services/      trade_math, fees, scoring, xp, metrics  (pure)
    app/routers/       auth, accounts, instruments, fee_profiles,
                       setups, trades, dashboard, uploads
    alembic/  tests/  scripts/seed_demo.py
  frontend/
    src/{tokens.css, api/, components/, pages/, lib/}
  docker-compose.yml   local Postgres
  .github/workflows/   ci.yml, backup.yml
```

## Milestone 0 — Scaffolding

**T0.1 Backend skeleton.** `backend/` with FastAPI app, `GET /health`,
settings via env vars, `pytest` configured.
Verify: `pytest` passes a health-check test; `uvicorn app.main:app`
serves `/health` -> `{"status":"ok"}`.

**T0.2 Local database.** `docker-compose.yml` (Postgres 16),
`DATABASE_URL`, SQLAlchemy engine/session, Alembic initialised.
Verify: `alembic upgrade head` runs cleanly against the container;
a test fixture creates and tears down a test schema.

**T0.3 Frontend skeleton.** `npm create vite` (React + TS), router,
TanStack Query provider, Vitest configured.
Verify: `npm run dev` renders a placeholder; `npm test` runs.

**T0.4 Design tokens.** `tokens.css` from the Arcade Quest design
system (colors, fonts, spacing, 2px borders, hard shadows, pressed
state). Base components: Button (primary/secondary/destructive),
Card, Input, Checkbox, Badge/Chip, XP bar.
Verify: a throwaway `/kitchen-sink` route shows each component and
matches the Stitch PNGs by eye.

## Milestone 1 — Domain logic (pure, test-first)

All in `backend/app/services/`, no DB. Write the test, watch it fail,
implement. Fixtures come from the mockup's Trade #71.

**T1.1 `trade_math.py`.** avg entry/exit from fills; points; gross
P&L; risk amount; net P&L; R-multiple.
Verify (fixture: NQ, tick 0.25, tick value 5.00; entries 20380.25 and
20377.75, exits 20391.00 and 20397.25, stop 20372.75):
avg entry `20379.00`, avg exit `20394.125`, gross `605.00`,
risk `250.00`, net `590.36` after fees, R `2.36`. Also cover a short
trade, a loss, no stop (R is null), and unequal fill sizes.
Scale-in cases (average-cost, not FIFO):
- Buy 1 @ 20,000.00, buy 1 @ 20,010.00, sell 2 @ 20,020.00 in one fill
  -> avg entry `20,005.00`, `15.00` pts, gross `600.00`; the same trade
  entered as two separate sell fills gives the identical gross.
- Unequal sizes (buy 1 @ 20,000, buy 3 @ 20,008, sell 4 @ 20,020) ->
  avg entry `20,006.00` (quantity-weighted).
- Per-exit realized points and P&L measured against the average entry
  (the ledger's TP1 row: exit 20,391.00 vs avg entry 20,379.00 ->
  `+12.00` pts, `+$240.00` for 1 contract).
- Risk is measured from the average entry to the single stop, so the
  scale-in trade above with a stop at 19,990 has risk `600.00`.

**T1.2 `fees.py`.** Apply a fee profile's components to fills with
`per_fill` and `per_contract` bases.
Verify: 4 fills with Exchange 1.60, Commission 2.00, Regulatory 0.06
per fill -> `6.40`, `8.00`, `0.24`, total `14.64`.
The fee count depends on how fills are entered: at Exchange 1.60 per
fill, the scale-in trade above costs `4.80` when the exit is one sell
fill of 2 (3 fills) and `6.40` when it is two sell fills of 1 (4
fills); with basis `per_contract` both give `6.40`.

**T1.3 `scoring.py`.** `execution_score`, band, compliance flag.
Verify: the mockup's weights 25/25/20/15/15 (total 100) with the
fourth unchecked -> `85` (Elite); nothing checked -> `0`; weights
totalling 50 with 25 checked -> `50` (normalised, not raw points); no
criteria -> `None`; band edges at 85, 70, 60.

**T1.4 `xp.py`.** XP per trade, level and in-level XP, win streak.
Verify: 8,420 total XP -> level 1 with 8,420/10,000; 10,000 -> level
2; streak counts only the most recent consecutive wins.

**T1.5 `metrics.py`.** From a list of trade rows: net P&L, profit
factor, win rate, expectancy, equity curve, peak, current and max
drawdown, discipline buckets with saved capital, per-setup table with
rank and low-sample flag.
Verify: small hand-computed datasets, including empty input (no
division by zero) and a single trade.

## Milestone 2 — Data layer, auth, configuration APIs

**T2.1 Models + migration.** All tables from spec §3, with `user_id`
ownership, `NUMERIC` money columns, indexes on
`(account_id, closed_at)` and `(setup_id)`.
Verify: `alembic upgrade head` then `downgrade base` both succeed;
constraint tests (weights > 0, direction enum).

**T2.2 Auth.** Seed script creates the single user; `POST /auth/login`
sets an httpOnly JWT cookie; `POST /auth/logout`; `get_current_user`
dependency on every other router.
Verify: tests for wrong password, missing cookie (401), expired token,
and that user A cannot read user B's rows (write this now, even with
one user, so ownership checks exist from day one).

**T2.3 Accounts, instruments, fee profiles (+ components).** CRUD
with ownership checks; archive instead of delete when referenced.
Seed a few fee-profile templates the user can copy.
Verify: API tests for create/list/update/archive and template copy.

**T2.4 Setups + criteria.** CRUD, ordered criteria, archive when
referenced.
Verify: API tests; reordering persists; deleting a used setup is
refused (archive instead).

## Milestone 3 — Trades and dashboard APIs

**T3.1 Create trade.** `POST /trades` accepts fills, stop/target,
setup, criteria checks (with optional notes), journaling fields, and
optional `screenshot_path`. Server computes all derived fields via
M1 services, snapshots `trade_fees` from the account's profile (client
may override amounts), writes `xp_events`, all in one transaction.
Verify: posting Trade #71's inputs returns net `590.36`, R `2.36`,
score `85`, 3 fee lines totalling `14.64`; invalid input (exit before
entry, zero quantity, criterion from another setup) returns 422.

**T3.2 Read, update, delete trade.** Detail endpoint returns the full
ledger, fees, checks and a signed screenshot URL. Update recomputes
everything and replaces the XP event; delete removes it.
Verify: edit a fill -> derived fields change; edit checklist -> score
and XP change.

**T3.3 List + filters + CSV.** `GET /trades` with date range, account
(or all), setup, side, result (win/loss/breakeven), text search, sort,
pagination; `GET /trades/export.csv` with the same filters.
Verify: filter combinations against a seeded set; CSV row count and
columns match the ledger table.

**T3.4 Screenshot upload.** `POST /uploads/screenshot` returns a
short-lived signed upload URL and object path; only image types and a
size cap are allowed.
Verify: test with Supabase Storage mocked; manual upload against the
real project during M6.

**T3.5 Dashboard endpoint.** `GET /dashboard?account=&range=` returns
everything in spec §4 (KPIs, equity curve points, drawdown, discipline
buckets, saved capital, recent trades, setups table, XP/level/streak).
Verify: response matches `metrics.py` on the seeded dataset;
account=ALL equals the sum of accounts.

**T3.6 Demo seed.** `scripts/seed_demo.py` builds the mockup's world:
one account ("Apex 150k"), NQ/ES, the Apex tariff, setups "celup
kaki", "hulur kepala", "FVG Retest", "FOMC News Spike", and ~90
generated trades.
Verify: dashboard numbers are in the same ballpark as the mockup (not
identical; the mockup's data is illustrative).

## Milestone 4 — Frontend shell and the three designed screens

Build against the exported HTML in `design/stitch/`, using real API
data from the seeded backend. Read the HTML for structure and copy,
but implement with our tokens and components rather than pasting the
generated markup.

**T4.1 App shell.** Login page, auth guard, header chrome (brand,
level/XP bar, streak, date-range switcher, account selector, "+ Log
Trade"), nav (Command HQ, Combat Logs, Skill Playbook), footer, API
client with 401 handling, and the "waking up the server" state for a
slow first request.
Verify: login/logout works against the backend; switching account or
range refetches; a simulated slow request shows the waking state.

**T4.2 Analytics Dashboard.** KPI tiles, Discipline vs win rate,
equity curve (win circle / loss diamond markers, baseline, ATH),
drawdown strip, recent trades, setups playbook table (sortable,
low-sample flag, rank pill).
Verify: side by side with `analytics-dashboard.png`; smoke test with
mocked data; empty state for a new account.

**T4.3 Trade Log Ledger.** Summary strip, filters (with active-filter
chips and "Clear filters"), sortable table, pagination, Export CSV.
Verify: side by side with `trade-log.png`; filters change the request
and the URL query string; CSV downloads.

**T4.4 Trade Detail & Review.** Header + KPIs, overview & risk,
execution ledger, fees & slippage, mindset notes, screenshot panel,
checklist breakdown with points and violations, prev/next trade.
Verify: side by side with `trade-detail.png`; Trade #71 numbers render
exactly as in the mockup.

## Milestone 5 — Screens without a design

Checkpoint before starting: either generate these in Stitch first (I
can do it through the Stitch tools using the same design system) or
build them straight from the tokens.

**T5.1 Log / Edit Trade form.** Account, instrument, side, session,
tags; dynamic entry/exit fill rows; planned stop/target; live preview
of avg entry/exit, gross, fees, net and R (using the same formulas as
the backend, checked against it); setup picker that reveals the
checklist with checkboxes and per-item notes; journaling fields;
screenshot upload; save.
Verify: component tests for fill math and checklist toggling; entering
Trade #71 by hand produces the same numbers the backend returns.

**T5.2 Setups.** List with stats, create/edit with an ordered, weighted
checklist builder (drag or up/down), archive.
Verify: component tests; a total-weight indicator warns when weights
do not sum to 100 (allowed, but flagged, since the score is normalised).

**T5.3 Settings.** Accounts, instruments (tick size and value),
fee profiles with components and "copy template", compliance cutoff.
Verify: creating an account and instrument is enough to log a first
trade end to end.

## Milestone 6 — Deploy

**T6.1 Supabase.** Create the project; run migrations using the
session-pooler URL; create the private storage bucket; keep RLS on
with no public policies.
Verify: `alembic upgrade head` against Supabase; upload and signed
read work.

**T6.2 Render.** Deploy the backend, set env vars (DB URL, Supabase
service key, JWT secret, allowed origin), health check on `/health`.
Verify: production `/health` responds; login works from `curl`.

**T6.3 Vercel.** Deploy the frontend with the API base URL; configure
CORS for the Vercel origin with credentials.
Verify: full login -> log trade -> dashboard flow on the deployed
site, including the cold-start state after idling.

**T6.4 Backups and CI.** `backup.yml` runs `pg_dump` on a schedule to
a private destination; `ci.yml` runs backend and frontend tests on
push.
Verify: trigger the backup manually and restore it into a scratch
database.

## Done when

- Log a trade from the form, see it in the ledger, its detail page and
  the dashboard, with matching numbers.
- Trade #71 reproduces the mockup exactly (net 590.36, 2.36R, 85%).
- All tests pass locally and in CI; the deployed site works after a
  cold start; a backup restores.

## Risks and open items

- **Undesigned screens** (M5) may need a design pass; decision at the
  M5 checkpoint.
- **Rank and sample thresholds** (Elite >= 90 avg score, low sample
  < 20 trades) are inferred from the mockup and are constants to tune.
- **Free-tier limits** (Render sleep, Supabase pause, no backups) are
  mitigated in the spec but should be re-checked at go-live.
- **Fee bases**: the mockup fees are `per_fill` with 1-lot fills;
  `per_contract` is supported for brokers that charge per contract.
  Confirm against your real broker statements when you have one.
- **Instruments**: generic tick size/value covers futures, forex and
  crypto; tell me which markets you trade so the seed templates match.
