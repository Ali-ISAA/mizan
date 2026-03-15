"""Activity log."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.api.v1.auth import require_user
from app.db.models.activity import ActivityLog
from app.db.models.user import User
from app.db.session import get_db

router = APIRouter(prefix="/activity", tags=["activity"])


class ActivityOut(BaseModel):
    id: str
    action: str
    resource_type: str | None
    resource_id: str | None
    detail: dict
    created_at: datetime


@router.get("", response_model=list[ActivityOut])
async def list_activity(limit: int = 50, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ActivityLog).where(ActivityLog.tenant_id == user.tenant_id).order_by(ActivityLog.created_at.desc()).limit(limit)
    )
    return [ActivityOut(id=str(a.id), action=a.action, resource_type=a.resource_type, resource_id=a.resource_id, detail=a.detail, created_at=a.created_at) for a in result.scalars().all()]
