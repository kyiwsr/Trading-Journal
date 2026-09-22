from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import require_allowed_origin
from app.routers import accounts, auth, dashboard, fee_profiles, instruments, setups, trades, uploads, user_settings

app = FastAPI(title="Trading Journal API", dependencies=[Depends(require_allowed_origin)])

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(instruments.router)
app.include_router(fee_profiles.router)
app.include_router(setups.router)
app.include_router(trades.router)
app.include_router(uploads.router)
app.include_router(dashboard.router)
app.include_router(user_settings.router)


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    # A real DB touch, not just a static reply, is what keeps Supabase's free
    # tier from pausing between the external uptime monitor's pings. Render's
    # own deploy health check hits this too, so a DB hiccup never fails it.
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except SQLAlchemyError:
        database = "unreachable"
    return {"status": "ok", "database": database}
