from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.deps import require_allowed_origin
from app.routers import auth

app = FastAPI(title="Trading Journal API", dependencies=[Depends(require_allowed_origin)])

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(auth.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
