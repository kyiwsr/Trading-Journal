# Demo account

The live site has a demo login with a generated sample journal, so a reviewer can look around without setting
anything up.

**Login:** `demo@example.com`. The password is not published here. Ask the repository owner for it.

The data is illustrative: one account (Apex 150k), two instruments (NQ, ES), four setups with weighted checklists,
and 90 generated trades over about 260 days. It is produced from a fixed random seed by
`backend/scripts/seed_demo.py` and every trade is saved through the same code path as `POST /trades`. It is not a
market record.

## Create it on the live database

Run from `backend/` on your own machine, with the production session-pooler string (see `DEPLOY.md`, step 1). Use a
separate demo user, not your own login, so the demo never touches your real journal.

```
$env:DATABASE_URL = "postgresql://postgres.<ref>:<password>@aws-...pooler.supabase.com:5432/postgres"
$env:SEED_EMAIL = "demo@example.com"; $env:SEED_PASSWORD = "<choose a password>"
.venv\Scripts\python -m scripts.seed_user
.venv\Scripts\python -m scripts.seed_demo
```

`seed_demo` refuses to run twice for the same user. Pass `--reset` to replace the demo data, for example if a
visitor has changed it.

## Things to know before publishing the login

- Anyone with the password can edit and delete the demo journal. Re-run `seed_demo --reset` to restore it.
- Five failed sign-ins lock an email for 15 minutes, which affects every visitor using the demo email.
- The demo user is a separate row from yours. Every query is scoped to `user_id`, so the demo cannot see your data.
