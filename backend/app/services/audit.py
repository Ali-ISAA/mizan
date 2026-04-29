"""Audit event logging — fire-and-forget helper."""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.activity import ActivityLog

logger = logging.getLogger(__name__)


async def log_event(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    action: str,
    severity: str,
    title: str,
    description: str | None = None,
    user_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    actor_email: str | None = None,
    detail: dict | None = None,
) -> None:
    """Write an audit event. Never raises — errors are logged and swallowed."""
    try:
        event = ActivityLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            severity=severity,
            title=title,
            description=description,
            resource_type=resource_type,
            resource_id=resource_id,
            actor_email=actor_email,
            detail=detail or {},
        )
        db.add(event)
        await db.commit()
    except Exception:
        logger.exception("Failed to log audit event action=%s tenant=%s", action, tenant_id)
