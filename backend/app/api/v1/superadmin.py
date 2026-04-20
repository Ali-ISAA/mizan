"""Superadmin endpoints — tenant management."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models.tenant import Tenant
from app.db.models.user import User
from app.db.session import get_db
from app.api.v1.auth import _hash, _create_token, _decode_token, _bearer
from datetime import timedelta
from fastapi.security import HTTPAuthorizationCredentials

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


async def require_superadmin(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        payload = _decode_token(credentials.credentials)
        if payload.get("role") != "superadmin":
            raise ValueError("Not superadmin")
        return payload
    except Exception:
        raise HTTPException(status_code=403, detail="Superadmin access required")


class SuperadminLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def superadmin_login(body: SuperadminLoginRequest):
    if body.email != settings.superadmin_email or body.password != settings.superadmin_password.get_secret_value():
        raise HTTPException(status_code=401, detail="Invalid superadmin credentials")
    token = _create_token({"sub": "superadmin", "role": "superadmin"}, timedelta(days=settings.refresh_token_expire_days))
    return {"access_token": token, "token_type": "bearer"}


class TenantOut(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    is_active: bool
    created_at: datetime


@router.get("/tenants", response_model=list[TenantOut])
async def list_tenants(_=Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    return [TenantOut(id=str(t.id), name=t.name, slug=t.slug, plan=t.plan, is_active=t.is_active, created_at=t.created_at) for t in result.scalars().all()]


@router.get("/stats")
async def system_stats(_=Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    tenant_count = await db.scalar(select(func.count(Tenant.id)))
    user_count = await db.scalar(select(func.count(User.id)))
    return {"tenants": tenant_count, "users": user_count}
