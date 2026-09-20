# Trading Journal — Design Spec

Date: 2026-09-19
Status: Approved for implementation planning

## 1. Purpose & Scope

A personal trading journal, initially for solo use, with an eye toward
opening it to other users later without a data-model rework.

Core loop: the user defines custom **setups** (their own trading
vocabulary and a weighted checklist of execution criteria per setup),
logs trades against those setups with full broker-style ledger detail,
and sees a dashboard of running balance and execution quality over
time.

Out of scope for v1: multiple accounts/brokers, multi-user
signup/auth, live market data or broker API integration, multiple
screenshots per trade, "required criteria" score capping.

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
  Recharts for the equity curve and stat charts, TanStack Query for
  API data fetching and caching.
- **Backend**: FastAPI (Python), deployed to Render (free web
  service). JSON REST API, no server-rendering. Free instances sleep
  after ~15 min idle, so the first request can take 30-60 s (see §7).
- **Database**: PostgreSQL on Supabase (free tier). FastAPI connects
  with SQLAlchemy using Supabase's **session pooler** connection
  string (IPv4-compatible; the direct connection is IPv6-only).
  Alembic migrations run against the same string.
- **File storage**: Supabase Storage (free tier, ~1 GB) for trade
  screenshots. The API issues short-lived signed upload URLs so images
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

accounts                 -- single account for v1; table already models
                          -- "an account" cleanly for future multi-account support
  id, user_id, broker_name, starting_balance, currency, created_at

fee_profiles
  id, account_id, name, commission_per_lot, spread_pips, swap_rate, notes
  -- user-entered, optionally pre-filled from a small static
  -- broker-template seed table shipped with the app

setups                    -- user-defined, free-text names (e.g. "celup kaki")
  id, user_id, name, description, created_at, archived_at

setup_criteria             -- the weighted checklist for a setup
  id, setup_id, label, weight (default 1), display_order

trades
  id, account_id, setup_id (nullable),
  symbol, direction (long/short),
  entry_price, exit_price, size,
  fees, slippage,
  opened_at, closed_at,
  pnl (computed & stored),
  r_multiple (computed & stored),
  execution_score (computed & stored, 0-100, nullable),
  notes, screenshot_url

trade_criteria_checks      -- which checklist items were followed, per trade
  id, trade_id, criterion_id, checked (bool)

trade_fills                 -- partial entries/exits
  id, trade_id, fill_type (entry/exit), price, size, filled_at
```

Notes:
- `pnl`, `r_multiple`, `execution_score` are computed server-side at
  write time and stored, not derived on every read — dashboard
  aggregate queries need to stay fast as trade count grows.
- `trade_fills` supports partial entries/exits; `trades` still holds
  single aggregate entry/exit values for the common single-fill case.
- Setups are archived, never deleted, once referenced by a trade — so
  historical trades keep their setup context.

## 4. Evaluation Scoring

```
execution_score = round(
    100 * sum(weight for checked criteria)
        / sum(weight for all criteria of the trade's setup)
)
```

- Recomputed server-side whenever a trade's checklist is created or
  edited.
- If a trade has no setup, or its setup has zero criteria,
  `execution_score` is `null` and excluded from dashboard averages
  (never treated as 0%).

## 5. Core Flows

1. **Setup management** — CRUD for setups; each setup owns an ordered,
   weighted checklist (`setup_criteria`). Setups are archived rather
   than deleted once a trade references them.
2. **Log a trade** — choose account + setup (optional), enter ledger
   data (single entry/exit or multiple `trade_fills`), fees/slippage,
   check off the setup's criteria, optionally upload one screenshot.
   Backend computes `pnl`, `r_multiple`, `execution_score` on save.
3. **Dashboard** — equity curve (`starting_balance + running Σpnl` over
   time), win rate, average R-multiple, average execution score — each
   shown overall and broken out per setup.
4. **Fee profile** — one editable fee profile per account. A small
   static seed table of common broker fee templates is shipped for the
   user to copy from and adjust; not live-fetched.

## 6. Testing Approach

- **Backend**: pytest. Scoring (`execution_score`) and ledger math
  (`pnl`, `r_multiple`) are pure functions — unit tested with fixed
  inputs/expected outputs. API endpoints tested via FastAPI's
  `TestClient` against a test database.
- **Frontend**: component tests for the trade-entry form (validation,
  fill math), light smoke coverage on dashboard rendering.

## 7. Deployment & Cost

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
