# Trading Journal

Personal trading journal: React (Vite, TypeScript) frontend, FastAPI backend, PostgreSQL.
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

## Frontend

```
cd frontend
npm install
npm run dev        # http://localhost:5173 ; components at /kitchen-sink
npm test
npm run build
```
