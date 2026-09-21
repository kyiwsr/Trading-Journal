from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.rate_limit import client_ip, login_limiter
from app.schemas.auth import LoginRequest, UserOut
from app.security import create_access_token, dummy_password_hash, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _cookie_options() -> dict:
    return {
        "path": "/",
        "domain": settings.cookie_domain,
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
    }


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> User:
    email = body.email.strip().lower()
    ip = client_ip(
        request.headers.get("x-forwarded-for"),
        request.client.host if request.client else None,
        settings.trusted_proxy_hops,
    )
    ip_key, email_key = f"ip:{ip}", f"email:{email}"

    waits = [w for w in (login_limiter.retry_after(ip_key), login_limiter.retry_after(email_key)) if w is not None]
    if waits:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many failed sign-in attempts. Try again later.",
            headers={"Retry-After": str(max(waits))},
        )

    user = db.scalar(select(User).where(User.email == email))
    password_hash = user.password_hash if user else dummy_password_hash()
    if not verify_password(password_hash, body.password) or user is None:
        login_limiter.record_failure(ip_key)
        login_limiter.record_failure(email_key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    login_limiter.reset(email_key)
    response.set_cookie(
        settings.cookie_name,
        create_access_token(user.id),
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        **_cookie_options(),
    )
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(settings.cookie_name, httponly=True, **_cookie_options())


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
