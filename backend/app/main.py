from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.deps import require_allowed_origin
from app.routers import accounts, auth, dashboard, fee_profiles, instruments, setups, trades, uploads

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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
