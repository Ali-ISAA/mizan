"""Activity log — tenant-scoped event feed."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.db.models.activity import ActivityLog
from app.db.models.user import User
from app.db.session import get_db

router = APIRouter(prefix="/activity", tags=["activity"])


class ActivityOut(BaseModel):
    id: str
    action: str
    severity: str
    title: str
    description: str | None
    actor_email: str | None
    resource_type: str | None
    resource_id: str | None
    detail: dict
    created_at: datetime


@router.get("", response_model=list[ActivityOut])
async def list_activity(
    limit: int = Query(default=20, le=100),
    user_only: bool = Query(default=False),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [ActivityLog.tenant_id == user.tenant_id]
    if user_only:
        filters.append(ActivityLog.user_id == user.id)
    result = await db.execute(
        select(ActivityLog)
        .where(*filters)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    return [
        ActivityOut(
            id=str(a.id),
            action=a.action,
            severity=a.severity,
            title=a.title,
            description=a.description,
            actor_email=a.actor_email,
            resource_type=a.resource_type,
            resource_id=a.resource_id,
            detail=a.detail,
            created_at=a.created_at,
        )
        for a in result.scalars().all()
    ]
