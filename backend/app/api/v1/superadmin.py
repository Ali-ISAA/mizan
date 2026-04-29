"""Superadmin endpoints — system administration."""
import uuid
from datetime import datetime, timedelta

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import _create_token, _decode_token, _bearer
from app.config import settings
from app.db.models.superadmin import SuperAdmin
from app.db.models.tenant import Tenant
from app.db.models.user import User
from app.db.session import get_db

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


# ── Auth ──────────────────────────────────────────────────────────────────────

class SuperadminLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def superadmin_login(body: SuperadminLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SuperAdmin).where(SuperAdmin.email == body.email))
    admin = result.scalar_one_or_none()

    if not admin or not admin.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not bcrypt.checkpw(body.password.encode(), admin.hashed_password.encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = _create_token(
        {"sub": str(admin.id), "role": "superadmin"},
        timedelta(days=settings.refresh_token_expire_days),
    )
    return {"access_token": token, "token_type": "bearer"}


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def system_stats(_=Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    tenant_count = await db.scalar(select(func.count(Tenant.id)))
    user_count = await db.scalar(select(func.count(User.id)))
    return {"tenants": tenant_count, "users": user_count}


# ── Tenants ───────────────────────────────────────────────────────────────────

class TenantOut(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    is_active: bool
    max_users: int
    max_documents: int
    max_storage_gb: int
    user_count: int
    created_at: datetime


@router.get("/tenants", response_model=list[TenantOut])
async def list_tenants(_=Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    # Count users per tenant in one query
    user_counts_q = (
        select(User.tenant_id, func.count(User.id).label("cnt"))
        .group_by(User.tenant_id)
        .subquery()
    )
    result = await db.execute(
        select(Tenant, func.coalesce(user_counts_q.c.cnt, 0).label("user_count"))
        .outerjoin(user_counts_q, Tenant.id == user_counts_q.c.tenant_id)
        .order_by(Tenant.created_at.desc())
    )
    rows = result.all()
    return [
        TenantOut(
            id=str(t.id),
            name=t.name,
            slug=t.slug,
            plan=t.plan,
            is_active=t.is_active,
            max_users=t.max_users,
            max_documents=t.max_documents,
            max_storage_gb=t.max_storage_gb,
            user_count=int(user_count),
            created_at=t.created_at,
        )
        for t, user_count in rows
    ]


# ── Users ─────────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: str
    is_active: bool
    tenant_id: str
    tenant_name: str
    created_at: datetime


@router.get("/users", response_model=list[UserOut])
async def list_users(_=Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User, Tenant)
        .join(Tenant, User.tenant_id == Tenant.id)
        .order_by(User.created_at.desc())
    )
    return [
        UserOut(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            is_active=u.is_active,
            tenant_id=str(u.tenant_id),
            tenant_name=t.name,
            created_at=u.created_at,
        )
        for u, t in result.all()
    ]


# ── Audit Events ──────────────────────────────────────────────────────────────

class AuditEventOut(BaseModel):
    id: str
    tenant_id: str | None
    tenant_name: str | None
    action: str
    severity: str
    title: str
    description: str | None
    actor_email: str | None
    resource_type: str | None
    resource_id: str | None
    created_at: datetime


@router.get("/audit", response_model=list[AuditEventOut])
async def list_audit_events(
    limit: int = Query(default=50, le=200),
    tenant_id: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    _=Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Superadmin: all audit events across all tenants."""
    from app.db.models.activity import ActivityLog
    from app.db.models.tenant import Tenant

    stmt = (
        select(ActivityLog, Tenant)
        .outerjoin(Tenant, ActivityLog.tenant_id == Tenant.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    if tenant_id:
        try:
            t_uuid = uuid.UUID(tenant_id)
            stmt = stmt.where(ActivityLog.tenant_id == t_uuid)
        except ValueError:
            pass
    if event_type:
        stmt = stmt.where(ActivityLog.action == event_type)

    result = await db.execute(stmt)
    return [
        AuditEventOut(
            id=str(a.id),
            tenant_id=str(a.tenant_id) if a.tenant_id else None,
            tenant_name=t.name if t else None,
            action=a.action,
            severity=a.severity,
            title=a.title,
            description=a.description,
            actor_email=a.actor_email,
            resource_type=a.resource_type,
            resource_id=a.resource_id,
            created_at=a.created_at,
        )
        for a, t in result.all()
    ]
