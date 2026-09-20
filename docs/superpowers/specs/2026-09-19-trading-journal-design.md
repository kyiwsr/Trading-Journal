# Trading Journal — Design Spec

Date: 2026-09-19 (revision 2: 2026-09-20, aligned with the Stitch design)
Status: Approved for implementation planning

Design reference: Stitch project "Execution-Focused Trading Journal"
(`projects/17281297860553652085`), theme "Arcade Quest Trader" (light).
Local copy of the three designed screens (HTML + PNG) lives in
`design/stitch/`.

## 1. Purpose & Scope

A personal trading journal, initially for solo use, with an eye toward
opening it to other users later without a data-model rework.

Core loop: the user defines custom **setups** (their own trading
vocabulary and a weighted checklist of execution criteria per setup),
logs closed trades against those setups with full broker-style ledger
detail (fills, per-fill fees, planned risk), and sees a dashboard of
balance, P&L quality and execution discipline over time.

In scope for v1:
- Multiple trading accounts, each with its own starting balance and
  fee profile, plus an "ALL" combined view.
- Generic instruments (tick size + tick value), so futures, forex and
  crypto all fit.
- Light gamification: Discipline XP, level, and a win-streak badge.
- CSV export of the trade ledger.

Out of scope for v1: multi-user signup, live market data / price
tickers, broker or prop-firm sync, open (in-progress) trades, multiple
screenshots per trade, "Trade Quests", "Vaults & Guilds" (social),
post-session review flow, note revision history / audit trail, bulk
edit, "Export replay", "required criteria" score capping, and a
pixel-designed mobile layout (desktop first; layouts must not break on
narrow screens).

## 2. Architecture

```
┌─────────────┐      HTTPS/JSON       ┌──────────────┐      SQL      ┌──────────────────┐
│   React SPA │ ───────────────────>  │  FastAPI     │ ────────────> │ Supabase         │
│  (Vercel)   │  <───────────────────  │  (Render)    │ <──────────── │  - PostgreSQL    │
└──────┬──────┘                       └──────────────┘               │  - Storage       │
       │        signed upload URL (issued by API)                    └──────────────────┘
       └────────────────────────────────────────────────────────────────────^
```

- **Frontend**: React + Vite SPA, deployed to Vercel (free Hobby tier).
  Recharts for the equity/drawdown charts, TanStack Query for API data
  fetching and caching.
- **Backend**: FastAPI (Python), deployed to Render (free web
  service). JSON REST API, no server-rendering. Free instances sleep
  after ~15 min idle, so the first request can take 30-60 s (see §8).
- **Database**: PostgreSQL on Supabase (free tier). FastAPI connects
  with SQLAlchemy using Supabase's **session pooler** connection
  string (IPv4-compatible; the direct connection is IPv6-only).
  Alembic migrations run against the same string.
- **File storage**: Supabase Storage (free tier, ~1 GB) for the trade
  screenshot. The API issues short-lived signed upload URLs so images
  go browser -> Supabase directly, never proxied through the API. The
  database stores only the object path.
- **Auth**: our own login — single seeded user, JWT in an httpOnly
  cookie, verified by FastAPI. Supabase Auth is intentionally not
  used, so the API has no dependency on it. Every table is rooted to
  `user_id` (directly or via account/setup) so adding real signup
  later is additive, not a migration.
- **Access control**: the browser never talks to Supabase's REST/data
  API with a public key; only FastAPI holds the service credentials
  (env vars on Render). Row-level security stays enabled with no
  public policies as a safety net.

## 3. Data Model

```
users
  id, email, password_hash, created_at

accounts
  id, user_id, name ("Apex 150k"), label ("#APX-9821"), broker_name,
  route (nullable, e.g. "CME via Rithmic"), starting_balance, currency,
  fee_profile_id (nullable), archived_at, created_at

instruments                       -- user-defined, generic across markets
  id, user_id, symbol ("NQ"), name ("E-mini Nasdaq"),
  tick_size (0.25), tick_value (5.00), created_at

fee_profiles                      -- "tariff", e.g. "Apex pro-prop default"
  id, user_id, name, notes

fee_components                    -- one row per fee line in a tariff
  id, fee_profile_id, name ("Exchange Fees"), amount (1.60),
  basis ('per_fill' | 'per_contract')
  -- per_fill: amount per fill; per_contract: amount x fill quantity
  -- a small static seed of broker/prop templates can be copied into a
  -- user's own fee_profiles; templates are not live-fetched

setups                            -- user-defined, free-text names
  id, user_id, name ("celup kaki"), subtitle ("Liquidity Sweep Scalp"),
  description, created_at, archived_at

setup_criteria                    -- the weighted checklist for a setup
  id, setup_id, label, weight (points, > 0), display_order

trades                            -- closed trades only in v1
  id, account_id, instrument_id, setup_id (nullable),
  direction ('long' | 'short'), session (nullable, "NY open"),
  tags (text[]), opened_at, closed_at,
  stop_price, target_price (nullable),          -- planned risk / reward
  -- derived at save time from fills (see §4), stored for fast reads:
  quantity, avg_entry, avg_exit, risk_amount,
  gross_pnl, fees_total, slippage_ticks, net_pnl,
  r_multiple, execution_score (0-100, nullable),
  -- journaling:
  pre_trade_focus, environment, debrief_notes,
  screenshot_path (nullable)

trade_fills                       -- source of truth for entries/exits
  id, trade_id, fill_type ('entry' | 'exit'), price, quantity,
  filled_at, note (nullable, "Initial probe")

trade_fees                        -- fee breakdown snapshot per trade
  id, trade_id, name, amount
  -- copied from the account's fee profile at save time, so later
  -- tariff edits never rewrite history; user may override amounts

trade_criteria_checks             -- which checklist items were followed
  id, trade_id, criterion_id, checked (bool), note (nullable)

xp_events
  id, user_id, trade_id, points, created_at
```

Notes:
- **Fills are the single source of truth.** Every trade has at least
  one entry fill and one exit fill; the single-fill case is just one
  of each. `quantity`, `avg_entry`, `avg_exit` on `trades` are derived.
- `gross_pnl`, `fees_total`, `net_pnl`, `risk_amount`, `r_multiple`,
  `execution_score` are computed server-side on write and stored,
  never trusted from the client.
- Setups are archived, never deleted, once referenced by a trade.
- Position size and P&L are instrument-generic:
  `points = direction_sign * (avg_exit - avg_entry)`;
  `gross_pnl = points / tick_size * tick_value * quantity`.

## 4. Calculations

**Trade math** (pure functions, server-side):
- `risk_amount = |avg_entry - stop_price| / tick_size * tick_value * quantity`
- `r_multiple = net_pnl / risk_amount` (null if no stop or zero risk)
- `net_pnl = gross_pnl - fees_total - slippage_cost`; `fees_total` is
  the sum of `trade_fees`.
- Fee components apply per the profile's `basis`, over all fills.

**Execution score**:
```
execution_score = round(
    100 * sum(weight for checked criteria)
        / sum(weight for all criteria of the trade's setup)
)
```
- If a trade has no setup, or its setup has zero criteria,
  `execution_score` is `null` and excluded from averages (never 0%).
- Score bands: Elite >= 85, Solid 70-84, Sub-optimal 60-69,
  Rule breach < 60. "Compliant" cutoff is a user setting (default 80).
  Bands and cutoff are constants in one module so they can be tuned.

**XP / level / streak**:
- Saving a trade with a scored checklist awards XP equal to its
  `execution_score` (one `xp_events` row; editing a trade replaces it).
- Level = `floor(total_xp / 10000) + 1`; the HUD shows XP within the
  current level over 10,000.
- Win streak = count of consecutive most-recent trades with
  `net_pnl > 0`, computed on read.

**Dashboard metrics** (filtered by account or ALL, and by date range
30D / 90D / YTD / ALL):
- Net P&L, gross profits, fees, % return on starting balance(s).
- Profit factor = gross profits / gross losses.
- Win rate, win/loss counts. Expectancy = mean `r_multiple`; total R.
- Equity curve (`starting_balance + running net_pnl` in close order),
  peak (ATH), current drawdown and max drawdown vs peak.
- **Discipline vs win rate**: trades bucketed by score band, each with
  count, win rate, net P&L, avg R. **Saved capital** = the absolute
  value of the Rule-breach bucket's net P&L when negative (P&L avoided
  had those trades been skipped).
- **Setups playbook table**: per setup: trades, win rate, net P&L,
  expectancy, avg checklist score, and a rank. Rank = "Negative edge"
  if expectancy < 0, else "Elite" if avg score >= 90, else "Solid".
  Setups with fewer than 20 trades show a "low sample" flag. (Rank and
  sample thresholds are constants derived from the mockup; tune later.)

## 5. Screens

Designed in Stitch (built against the exported HTML in `design/stitch/`):
1. **Analytics Dashboard** ("Command HQ").
2. **Trade Log Ledger** — filters (date, account, setup, side,
   win/loss/breakeven, search), sort, pagination, CSV export.
3. **Trade Detail & Review** — overview & risk, execution ledger, fees
   & slippage, mindset notes, screenshot, checklist score breakdown.

Not designed yet (built in the same design system; can be generated in
Stitch first if wanted):
4. **Log / Edit Trade** form — the core input flow.
5. **Setups** ("Skill Playbook") list + checklist editor.
6. **Settings** — accounts, instruments, fee profiles (with template
   copy), compliance cutoff.
7. **Login**, plus empty and loading states, and the "waking up the
   server" state (§8).

Global chrome shown on every screen: brand, level + XP bar, streak,
date-range switcher, account selector, "+ Log Trade".
Nav items kept: Command HQ, Combat Logs, Skill Playbook. "Trade Quests"
and "Vaults & Guilds" are removed from the nav for v1. Live price
tickers and the "Synced" indicator are removed (manual journal).

## 6. Visual Theme

"Arcade Quest Trader" (light): white canvas, deep navy `#004777`
borders/text (2px solid), ember orange `#FF7700` actions/XP, crimson
`#A30000` losses/breaches, success green `#008A4B`. Hard offset shadows
(`3px 3px 0 #004777`), pressed-state translate. Fonts: Space Grotesk
(headlines), Hanken Grotesk (body), Space Mono (numbers, labels).
Implemented as CSS variables/tokens taken from the Stitch design
system, not scattered hex values.

## 7. Testing Approach

- **Backend**: pytest. Trade math, scoring, XP/level/streak, and
  dashboard aggregates are pure functions unit-tested against fixed
  cases (including the mockup's own numbers as fixtures). API
  endpoints tested via FastAPI's `TestClient` against a test database.
- **Frontend**: Vitest + Testing Library for the trade form (fill
  math, checklist toggling) and formatting helpers; a smoke test per
  screen rendering against mocked API data.

## 8. Deployment & Cost

Target: **$0/month** (domain optional, ~$10-15/year).

- Frontend: Vercel Hobby, auto-deploy from `main`. (Hobby is
  non-commercial; upgrade to Pro if this ever charges customers.)
- Backend: Render free web service, auto-deploy from `main`. Secrets
  (DB URL, Supabase service key, JWT secret) live in Render env vars.
- Database + screenshots: Supabase free project.

Free-tier constraints and mitigations:
- **Render cold start (30-60 s after ~15 min idle):** the frontend
  shows a "waking up the server" state on the first request instead of
  a bare error. Optional: an external uptime pinger (e.g. UptimeRobot,
  free) hitting a `/health` endpoint every 5 min keeps it awake.
- **Supabase pauses free projects after ~1 week of inactivity:**
  daily use avoids this; a long break needs a manual resume in the
  Supabase dashboard.
- **No managed backups on the free tier:** a scheduled `pg_dump`
  (e.g. weekly GitHub Actions job writing to a private location) is
  part of the v1 scope, since trade history is the whole product.
- **Upgrade path:** if the cold starts become annoying, moving the API
  to a $5/mo host (Railway/Render paid) changes only the deploy
  target — no code changes.

Verify current free-tier limits on each provider's pricing page
before go-live; they change.
