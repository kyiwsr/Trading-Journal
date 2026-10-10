# Architecture

## System

```mermaid
flowchart LR
    B[Browser<br/>React SPA] -->|"/api/* (same origin)"| V[Vercel<br/>static files + rewrite]
    V -->|rewrite| R[Render<br/>FastAPI]
    R -->|SQLAlchemy, session pooler| P[(Supabase<br/>PostgreSQL)]
    R -->|service key: sign upload URL| S[(Supabase<br/>Storage)]
    B -.->|signed upload URL| S
    G[GitHub Actions] -->|CI on push| R
    G -->|weekly encrypted pg_dump| P
```

- The browser only talks to the Vercel site. `frontend/vercel.json` rewrites `/api/*` to Render, so the login
  cookie is first-party (`SameSite=Lax`, `Secure`, no `Domain`) and no custom domain is needed.
- Only FastAPI holds Supabase credentials. The browser never calls Supabase's own data API. Row-level security is
  switched on with no public policies as a second lock.
- Screenshots go browser to Supabase Storage on a short-lived signed URL the API issues. The database stores the
  object path only.
- Auth is the app's own: a seeded user, a JWT in an httpOnly cookie, failed logins limited to 5 per 15 minutes per
  IP and per email.
- Money and price columns are `NUMERIC`, and the server computes every derived figure (P&L, R, score) on write.
  The client never supplies them.

## Data model

```mermaid
erDiagram
    users ||--o{ accounts : owns
    users ||--o{ instruments : owns
    users ||--o{ setups : owns
    users ||--o{ fee_profiles : owns
    users ||--o{ xp_events : earns
    fee_profiles ||--o{ fee_components : "has lines"
    fee_profiles ||--o{ accounts : "charges"
    accounts ||--o{ trades : holds
    instruments ||--o{ trades : "traded as"
    setups ||--o{ trades : "tagged with"
    setups ||--o{ setup_criteria : "has checklist"
    trades ||--|{ trade_fills : "entries and exits"
    trades ||--o{ trade_fees : "fee snapshot"
    trades ||--o{ trade_criteria_checks : "checklist result"
    setup_criteria ||--o{ trade_criteria_checks : "answered by"
    trades ||--o| xp_events : awards

    accounts {
        int id PK
        string name
        numeric starting_balance
        numeric minimum_threshold
    }
    instruments {
        int id PK
        string symbol
        numeric tick_size
        numeric tick_value
    }
    trades {
        int id PK
        string direction
        timestamptz opened_at
        timestamptz closed_at
        numeric stop_price
        numeric avg_entry
        numeric avg_exit
        numeric net_pnl
        numeric r_multiple
        int execution_score
        string screenshot_path
    }
    trade_fills {
        int id PK
        string fill_type
        numeric price
        numeric quantity
    }
    setup_criteria {
        int id PK
        string label
        int weight
    }
```

Column lists are abridged; the full schema is in `backend/app/models/` and the Alembic migrations.

Design decisions worth knowing:

- **Fills are the source of truth.** Quantity, average entry and exit on `trades` are derived from `trade_fills`,
  so scale-ins and partial exits work without a special case.
- **Fees are snapshotted per trade** (`trade_fees`), copied from the account's fee profile at save time. Editing a
  tariff later never rewrites history.
- **Setups are archived, never deleted**, once a trade references them (`ON DELETE RESTRICT`).
- **Execution score** is `100 * checked weight / total weight` for the trade's setup. A trade with no setup, or a
  setup with no criteria, scores `null` and is left out of averages rather than counted as 0.
- Every table is rooted to `user_id`, directly or through its parent, so opening the app to more users later does
  not need a schema rework.
