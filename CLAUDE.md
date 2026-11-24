# ApexLog (Trading-Journal)

A single-user trading journal. Each setup has a weighted checklist, every trade is scored against it, and the dashboard splits results by discipline band. Live at https://trading-journal-eight-phi.vercel.app. Architecture and ERD: `docs/architecture.md`. Decisions and trade-offs: `docs/case-study.md`. Deploy steps: `docs/DEPLOY.md`.

## Layout

- `backend/` FastAPI + SQLAlchemy + Alembic. Routers in `app/routers`, pure calculation in `app/services` (`trade_math`, `fees`, `scoring`, `xp`, `metrics`, `rounding`), models in `app/models`.
- `frontend/` React 19 + Vite + React Router + TanStack Query + Recharts. Plain JavaScript and JSX, no TypeScript (it was removed on purpose; do not add it back).
- `docs/`, `design/stitch/` (Stitch exports), `.github/workflows/` (CI and weekly encrypted `pg_dump`).

## Commands

Backend (run from `backend/`):

```
python -m pytest                       # needs Postgres, see TEST_DATABASE_URL in .env.example
alembic upgrade head
python scripts/seed_user.py            # reads SEED_EMAIL / SEED_PASSWORD
```

Frontend (run from `frontend/`):

```
npm run dev
npm run lint        # oxlint
npm test            # vitest run
npm run build
```

CI runs backend pytest, then frontend lint, test and build. All of it must pass before a push is considered done.

## Local database

Tests run against real Postgres, not SQLite or mocks. The dev cluster is at `%LOCALAPPDATA%\TradingJournalDev\pgdata` on port 5433 (databases `journal` and `journal_test`). It does not start after a reboot:

```
pg_ctl -D "%LOCALAPPDATA%\TradingJournalDev\pgdata" -o "-p 5433 -c listen_addresses=127.0.0.1" start
```

Start it detached. Point `DATABASE_URL` and `TEST_DATABASE_URL` in `backend/.env` at port 5433.

## Rules that must hold

- Money and prices are `NUMERIC` in the database and `Decimal` in Python (`decimal.js` on the client). Never use floats for money, price, or R.
- The server computes every derived figure (net P&L, R-multiple, execution score, XP) on write. The client never supplies them.
- Fills are the source of truth for a trade. Averages and P&L derive from fills, not the other way round.
- Only FastAPI holds Supabase credentials. The browser never calls Supabase's data API. Screenshots go to Storage over a short-lived signed URL the API issues, and the DB stores the object path only.
- Auth is the app's own single-user JWT in an httpOnly cookie (`SameSite=Lax`, `Secure`, no `Domain`). Keep the Origin check on POST/PUT/PATCH/DELETE and the login rate limit (5 failures per 15 minutes per IP and per email).
- Schema changes go through an Alembic migration. Do not edit the database by hand.
- Keep the hosting bill at $0: Vercel, Render and Supabase free tiers only. Do not add paid services.
- Scope is fixed: multiple accounts plus an ALL view, generic instruments (tick size and value), checklist-weighted score, XP + level + streak. No Quests or Guilds, one screenshot per trade.

## Frontend conventions

- Styling comes from the tokens in `frontend/src/tokens.css`. Read `frontend/DESIGN.md` before touching UI. Do not hardcode colors, fonts or spacing.
- Orange `#FF7700` is a fill for primary action, XP and streak only. Never use it as text. Use `--green-text` for green text and `--crimson` for losses.
- Win and loss are never color alone: a circle or "WIN" for wins, a diamond or "LOSS" for losses.
- Motion is limited to the button press state and 80ms shadow changes. No loops, no entrance animation.
- Reuse components from `src/components` before adding new ones. Server data goes through TanStack Query in `src/api/queries.js`.
- Add a test with every behavior change. Backend tests sit beside the layer they cover in `backend/tests/api` and `backend/tests/services`; frontend tests are `*.test.jsx` next to the code.

## Deploy gotchas

These all cost time once already. Details are in `docs/DEPLOY.md`.

- Open the Vercel production URL, not a per-deployment `-hash-username.vercel.app` URL, or the backend's Origin check rejects the request.
- Vercel will not auto-deploy a commit whose author email is not verified on the pushing GitHub account. This repo uses a repo-local `git config user.email` set to the verified address. Do not change it.
- The `screenshots` Supabase Storage bucket must exist, otherwise uploads fail with a vague "storage unavailable" error.
- Render's free tier sleeps. The client handles the wake-up delay in `src/api/waking.js`.

## Working style

- Load the `antislop` and `antislop-code` skills before writing or running code. Add `antislop-ui`, `antislop-human` and `antislop-layoutmobile` for frontend work. Tell any spawned subagent to do the same, since they do not inherit skills.
- Comments explain why, never what. No filler comments, no invented content, no placeholder copy.
- A request to "design it", a Stitch task, or a reference URL means a mockup or screenshots, not a scaffolded codebase. Ask before building.
- Keep changes surgical. Match the existing style, do not refactor neighbors, and do not add dependencies without a reason.
- The machine has 16 GB of RAM and runs two antivirus products. Run one heavy job at a time (test suite, build, dev server).
- Never commit `.env`, keys, the demo password, or database dumps.

## PowerShell notes

- `"$var.prop"` reads `.prop` as a property access. Use `${var}` or build the string separately.
- Paste multi-line `Read-Host` scripts as one line, or one prompt swallows the next line as its answer.
