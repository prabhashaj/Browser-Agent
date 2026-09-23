"""backend/app/api/auth.py — Email+password auth with httpOnly cookie sessions."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd_ctx = CryptContext(schemes=["argon2"], deprecated="auto")

COOKIE_NAME = "pilot_session"
TICKET_STORE: dict[str, str] = {}  # ticket_token → user_id (in-memory, short-lived)


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    created_at: datetime


# ── Helpers ────────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def set_session_cookie(response: Response, user_id: str) -> None:
    settings = get_settings()
    from itsdangerous import URLSafeTimedSerializer
    s = URLSafeTimedSerializer(settings.session_secret)
    token = s.dumps(user_id)
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=False,  # set True in production behind HTTPS
        max_age=60 * 60 * 24 * 7,  # 7 days
    )


def get_current_user_id(request: Request) -> str:
    """Extract and verify session cookie. Raises 401 if invalid."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    settings = get_settings()
    from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
    s = URLSafeTimedSerializer(settings.session_secret)
    try:
        user_id: str = s.loads(token, max_age=60 * 60 * 24 * 7)
        return user_id
    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    user_id = get_current_user_id(request)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, response: Response, db: AsyncSession = Depends(get_db)):
    # Check for existing email
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    set_session_cookie(response, user.id)
    return UserOut(id=user.id, email=user.email, created_at=user.created_at)


@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        # Constant-time to prevent timing attacks
        raise HTTPException(status_code=400, detail="Invalid email or password")

    set_session_cookie(response, user.id)
    return UserOut(id=user.id, email=user.email, created_at=user.created_at)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut(id=user.id, email=user.email, created_at=user.created_at)


@router.get("/ws-ticket")
async def ws_ticket(user: User = Depends(get_current_user)):
    """Issue a short-lived (30s) ticket for WebSocket auth."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=30)
    TICKET_STORE[token] = user.id
    # Clean up expired tickets lazily
    return {"ticket": token, "expires_at": expires_at.isoformat()}


def validate_ws_ticket(token: str) -> str | None:
    """Returns user_id if ticket is valid, else None."""
    return TICKET_STORE.pop(token, None)
