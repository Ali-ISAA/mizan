"""Authentication: register, login, refresh."""
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models.tenant import Tenant
from app.db.models.user import User
from app.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

SECRET = settings.secret_key.get_secret_value()
ALGO = settings.algorithm


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _create_token(data: dict, expires_delta: timedelta) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + expires_delta}
    return jwt.encode(payload, SECRET, algorithm=ALGO)


def _decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET, algorithms=[ALGO])


async def get_current_user(token: str, db: AsyncSession) -> User:
    try:
        payload = _decode_token(token)
        user_id = uuid.UUID(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ─── Dependency ───────────────────────────────────────────────────────────────
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer()


async def require_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    return await get_current_user(credentials.credentials, db)


async def require_admin(user: User = Depends(require_user)) -> User:
    if user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin required")
    return user


# ─── Schemas ──────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    org_name: str  # creates a new tenant


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    role: str
    tenant_id: str


# ─── Routes ───────────────────────────────────────────────────────────────────
@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check email uniqueness across all tenants
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    slug = body.org_name.lower().replace(" ", "-")[:100]
    existing_tenant = await db.execute(select(Tenant).where(Tenant.slug == slug))
    if existing_tenant.scalar_one_or_none():
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    tenant = Tenant(name=body.org_name, slug=slug)
    db.add(tenant)
    await db.flush()

    user = User(
        tenant_id=tenant.id,
        email=body.email,
        hashed_password=_hash(body.password),
        full_name=body.full_name,
        role="owner",
    )
    db.add(user)
    await db.flush()

    access_token = _create_token({"sub": str(user.id), "tenant": str(tenant.id)}, timedelta(minutes=settings.access_token_expire_minutes))
    refresh_token = _create_token({"sub": str(user.id), "type": "refresh"}, timedelta(days=settings.refresh_token_expire_days))
    user.refresh_token = refresh_token
    user.refresh_token_expires_at = (datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)).replace(tzinfo=None)
    await db.commit()

    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user_id=str(user.id), email=user.email, role=user.role, tenant_id=str(tenant.id))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not _verify(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    tenant = await db.get(Tenant, user.tenant_id)
    access_token = _create_token({"sub": str(user.id), "tenant": str(user.tenant_id)}, timedelta(minutes=settings.access_token_expire_minutes))
    refresh_token = _create_token({"sub": str(user.id), "type": "refresh"}, timedelta(days=settings.refresh_token_expire_days))
    user.refresh_token = refresh_token
    user.refresh_token_expires_at = (datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)).replace(tzinfo=None)
    await db.commit()

    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user_id=str(user.id), email=user.email, role=user.role, tenant_id=str(user.tenant_id))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = _decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError("Not a refresh token")
        user_id = uuid.UUID(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = await db.get(User, user_id)
    if not user or user.refresh_token != body.refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    access_token = _create_token({"sub": str(user.id), "tenant": str(user.tenant_id)}, timedelta(minutes=settings.access_token_expire_minutes))
    refresh_token = _create_token({"sub": str(user.id), "type": "refresh"}, timedelta(days=settings.refresh_token_expire_days))
    user.refresh_token = refresh_token
    user.refresh_token_expires_at = (datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)).replace(tzinfo=None)
    await db.commit()

    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user_id=str(user.id), email=user.email, role=user.role, tenant_id=str(user.tenant_id))
