# Trading Journal

Personal trading journal: React (Vite) frontend, FastAPI backend, PostgreSQL.
Spec: `docs/superpowers/specs/`, plan: `docs/superpowers/plans/`, design exports: `design/stitch/`.

## Backend

```
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt      # Windows
cp ../.env.example .env                             # adjust DATABASE_URL if needed
.venv\Scripts\python -m pytest
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

## Database (local)

Either `docker compose up -d db` from the repo root, or use a local PostgreSQL and create the
role and databases once (as a superuser):

```
CREATE ROLE journal LOGIN PASSWORD 'journal';
CREATE DATABASE journal OWNER journal;
CREATE DATABASE journal_test OWNER journal;
```

Then `cd backend && .venv\Scripts\alembic upgrade head`. DB tests skip when Postgres is unreachable.

Create the login once from `backend/`, with `SEED_EMAIL` and `SEED_PASSWORD` set in the environment
(add `--reset` to replace an existing password):

```
.venv\Scripts\python -m scripts.seed_user
```

## Frontend

```
cd frontend
npm install
npm run dev        # http://localhost:5173 ; components at /kitchen-sink
npm test
npm run build
```

In dev, Vite proxies `/api` to the backend on port 8000, so the login cookie stays same-site. Start the
backend (`uvicorn app.main:app --port 8000` from `backend/`), seed the demo journal with
`python -m scripts.seed_demo`, then sign in with the user from `scripts.seed_user`.
Deployed, `frontend/vercel.json` forwards `/api` to the backend the same way. See `docs/DEPLOY.md`.
