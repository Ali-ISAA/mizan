# Audit Events Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time audit event system that logs compliance activities and surfaces them as "Recent Activity" in the main frontend dashboard and as "Recent Activity + Audit Logs" in the superadmin dashboard.

**Architecture:** Extend the existing `activity_logs` table (already in the DB with `ActivityLog` model) by adding `severity`, `title`, `description`, and `actor_email` columns. A thin `audit` service module provides a fire-and-forget `log_event()` helper that existing endpoints call after their main work. The existing `GET /api/v1/activity` route (already coded but never registered in `main.py`) is registered and extended. A new `GET /api/v1/superadmin/audit` endpoint serves the admin panel with cross-tenant data. The `ActivityTimeline` component (currently hardcoded mock data) is wired to the real API. A full `Activity.tsx` page provides paginated history. The superadmin `Dashboard.tsx` gains two live sections.

**Tech Stack:** FastAPI + SQLAlchemy async (backend), Alembic (migrations), React 19 + TypeScript + React Query + Tailwind (frontend)

---

## File Map

### New files
| File | Purpose |
|---|---|
| `backend/app/services/audit.py` | `log_event()` helper — writes `ActivityLog` rows, never raises |
| `frontend/src/pages/Activity.tsx` | Full paginated activity log page for main frontend |

### Modified files
| File | Change |
|---|---|
| `backend/app/db/models/activity.py` | Add `severity`, `title`, `description`, `actor_email` columns |
| `backend/alembic/versions/005_extend_activity_log.py` | Migration adding those 4 columns with safe defaults |
| `backend/app/api/v1/activity.py` | Extend `ActivityOut` schema + return new fields |
| `backend/app/main.py` | Register `activity.router` |
| `backend/app/api/v1/auth.py` | Log `user_login` after successful login |
| `backend/app/api/v1/documents.py` | Log `document_uploaded` + `analysis_started` |
| `backend/app/tasks/compare_documents.py` | Log `analysis_completed` / `analysis_failed` |
| `backend/app/api/v1/superadmin.py` | Add `GET /superadmin/audit` endpoint |
| `frontend/src/components/dashboard/activity-timeline.tsx` | Replace mock data with real API call |
| `frontend/src/App.tsx` | Add `/activity` route |
| `superadmin/src/pages/Dashboard.tsx` | Add Recent Activity + Audit Logs sections |

---

## Chunk 1: Backend Model + Migration + Service

### Task 1: Extend ActivityLog model

**Files:**
- Modify: `backend/app/db/models/activity.py`
- Test: `backend/tests/test_audit_model.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_audit_model.py
from app.db.models.activity import ActivityLog


def test_activity_log_has_audit_columns():
    """ActivityLog must have the 4 new audit columns."""
    log = ActivityLog(
        action="user_login",
        severity="success",
        title="User signed in",
        description="ali@example.com signed in",
        actor_email="ali@example.com",
    )
    assert log.severity == "success"
    assert log.title == "User signed in"
    assert log.description == "ali@example.com signed in"
    assert log.actor_email == "ali@example.com"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_audit_model.py -v
```
Expected: `FAIL — AttributeError: severity`

- [ ] **Step 3: Extend the model**

Replace `backend/app/db/models/activity.py` with:

```python
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str | None] = mapped_column(String(50))
    resource_id: Mapped[str | None] = mapped_column(String(255))
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    # ── Audit fields (added migration 005) ──────────────────────────────────
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_audit_model.py -v
```
Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models/activity.py backend/tests/test_audit_model.py
git commit -m "feat: extend ActivityLog with severity, title, description, actor_email"
```

---

### Task 2: Alembic migration 005

**Files:**
- Create: `backend/alembic/versions/005_extend_activity_log.py`

- [ ] **Step 1: Create migration file**

```python
# backend/alembic/versions/005_extend_activity_log.py
"""Extend activity_logs with audit columns.

Revision ID: 005
Revises: 004
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("activity_logs", sa.Column("severity",    sa.String(20),  nullable=False, server_default="info"))
    op.add_column("activity_logs", sa.Column("title",       sa.String(255), nullable=False, server_default=""))
    op.add_column("activity_logs", sa.Column("description", sa.Text(),      nullable=True))
    op.add_column("activity_logs", sa.Column("actor_email", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("activity_logs", "actor_email")
    op.drop_column("activity_logs", "description")
    op.drop_column("activity_logs", "title")
    op.drop_column("activity_logs", "severity")
```

- [ ] **Step 2: Run migration**

```bash
cd backend && docker-compose exec backend alembic upgrade head
```
Or if running outside Docker:
```bash
cd backend && alembic upgrade head
```
Expected: `Running upgrade 004 -> 005, Extend activity_logs with audit columns`

- [ ] **Step 3: Verify columns exist**

```bash
docker-compose exec db psql -U mizan -d mizan -c "\d activity_logs"
```
Expected: columns `severity`, `title`, `description`, `actor_email` present.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/005_extend_activity_log.py
git commit -m "feat: migration 005 — add audit columns to activity_logs"
```

---

### Task 3: Audit service

**Files:**
- Create: `backend/app/services/audit.py`
- Test: `backend/tests/test_audit_service.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_audit_service.py
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_log_event_creates_activity_log():
    """log_event should add an ActivityLog to the DB session."""
    from app.services.audit import log_event

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    tenant_id = uuid.uuid4()
    await log_event(
        db=mock_db,
        tenant_id=tenant_id,
        action="document_uploaded",
        severity="success",
        title="Document uploaded",
        description="test.pdf was uploaded",
        actor_email="ali@example.com",
    )

    mock_db.add.assert_called_once()
    added = mock_db.add.call_args[0][0]
    assert added.action == "document_uploaded"
    assert added.severity == "success"
    assert added.title == "Document uploaded"
    assert added.tenant_id == tenant_id
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_log_event_never_raises():
    """log_event must swallow DB errors so the caller isn't broken."""
    from app.services.audit import log_event

    mock_db = AsyncMock()
    mock_db.add = MagicMock(side_effect=Exception("DB exploded"))

    # Should NOT raise
    await log_event(
        db=mock_db,
        tenant_id=uuid.uuid4(),
        action="document_uploaded",
        severity="success",
        title="Document uploaded",
        description=None,
    )
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_audit_service.py -v
```
Expected: `FAIL — ModuleNotFoundError: app.services.audit`

- [ ] **Step 3: Implement audit service**

Create `backend/app/services/audit.py`:

```python
"""Audit event logging — fire-and-forget helper."""
import logging
import uuid
from typing import Any

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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_audit_service.py -v
```
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/audit.py backend/tests/test_audit_service.py
git commit -m "feat: audit service with fire-and-forget log_event helper"
```

---

### Task 4: Register activity router + extend API response

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/v1/activity.py`

- [ ] **Step 1: Register the activity router in main.py**

In `backend/app/main.py`, change the import line and add router registration:

```python
# Change this line:
from app.api.v1 import auth, documents, superadmin, base_documents

# To:
from app.api.v1 import auth, documents, superadmin, base_documents, activity
```

And add after the other `app.include_router(...)` calls:
```python
app.include_router(activity.router, prefix="/api/v1")
```

- [ ] **Step 2: Extend ActivityOut schema in activity.py**

Replace `backend/app/api/v1/activity.py` with:

```python
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
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.tenant_id == user.tenant_id)
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
```

- [ ] **Step 3: Verify backend starts without error**

```bash
docker-compose restart backend
docker-compose logs backend --tail=20
```
Expected: `Application startup complete` — no errors.

- [ ] **Step 4: Verify endpoint is reachable**

```bash
curl http://localhost:8001/api/v1/activity \
  -H "Authorization: Bearer <your_token>"
```
Expected: `[]` (empty list — no events yet)

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/app/api/v1/activity.py
git commit -m "feat: register activity router and extend ActivityOut schema"
```

---

## Chunk 2: Backend Hooks + Superadmin Endpoint

### Task 5: Log user_login in auth.py

**Files:**
- Modify: `backend/app/api/v1/auth.py`

- [ ] **Step 1: Add audit import and log_event call in login route**

At top of `backend/app/api/v1/auth.py`, add import:
```python
from app.services.audit import log_event
```

Inside the `login` route, after `await db.commit()` (line ~147), add:

```python
    await log_event(
        db=db,
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="user_login",
        severity="info",
        title="User signed in",
        description=f"{user.email} signed in",
        actor_email=user.email,
    )
```

- [ ] **Step 2: Verify by logging in via the frontend**

Open `http://localhost:8002` → log out → log in again.

Then check:
```bash
curl http://localhost:8001/api/v1/activity \
  -H "Authorization: Bearer <your_token>"
```
Expected: 1 event with `action: "user_login"`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/v1/auth.py
git commit -m "feat: log user_login audit event on successful sign-in"
```

---

### Task 6: Log document_uploaded and analysis_started in documents.py

**Files:**
- Modify: `backend/app/api/v1/documents.py`

- [ ] **Step 1: Add import at top of documents.py**

```python
from app.services.audit import log_event
```

- [ ] **Step 2: Log document_uploaded after upload commit**

In the `upload_document` route, after `await db.refresh(doc)` (line ~159), before `process_user_document_task.delay(...)`, add:

```python
    await log_event(
        db=db,
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="document_uploaded",
        severity="success",
        title="Document uploaded",
        description=f"{doc.name} was uploaded and queued for processing",
        resource_type="document",
        resource_id=str(doc.id),
        actor_email=user.email,
    )
```

- [ ] **Step 3: Log analysis_started after comparison created**

In the `start_comparison` route, after the `return {...}` line inside the try block, before the return, add:

```python
        await log_event(
            db=db,
            tenant_id=user.tenant_id,
            user_id=user.id,
            action="analysis_started",
            severity="info",
            title="Compliance analysis started",
            description=f"Analysis started for {doc.name}",
            resource_type="comparison",
            resource_id=str(comparison.id),
            actor_email=user.email,
        )
```

Note: the `doc` variable is already available in scope from the earlier `doc = await db.get(MizanDocument, doc_uuid)`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/documents.py
git commit -m "feat: log document_uploaded and analysis_started audit events"
```

---

### Task 7: Log analysis_completed / analysis_failed in Celery task

**Files:**
- Modify: `backend/app/tasks/compare_documents.py`

The Celery task manages its own `AsyncSession` via `WorkerAsyncSessionLocal`. The audit service accepts any `AsyncSession`, so we pass the same `db` object.

- [ ] **Step 1: Add import at top of compare_documents.py**

```python
from app.services.audit import log_event
```

- [ ] **Step 2: Log analysis_completed after successful commit**

Inside `_compare_documents_impl`, after `logger.info(f"Comparison {comparison_id} completed: Score={report.compliance_score}")`, add:

```python
            await log_event(
                db=db,
                tenant_id=comparison.tenant_id,
                action="analysis_completed",
                severity="success" if report.compliance_score >= 80 else "warning",
                title="Compliance analysis completed",
                description=(
                    f"Analysis finished with score {report.compliance_score}% "
                    f"({report.total_findings} findings)"
                ),
                resource_type="comparison",
                resource_id=str(comparison_id),
            )
```

- [ ] **Step 3: Log analysis_failed in the except block**

Inside the `except Exception as e:` handler, after `comparison.status = "failed"` and before `await db.commit()`, add:

```python
                await log_event(
                    db=db,
                    tenant_id=comparison.tenant_id,
                    action="analysis_failed",
                    severity="error",
                    title="Compliance analysis failed",
                    description=str(e)[:200],
                    resource_type="comparison",
                    resource_id=str(comparison_id),
                )
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/tasks/compare_documents.py
git commit -m "feat: log analysis_completed/failed audit events from Celery task"
```

---

### Task 8: Add GET /superadmin/audit endpoint

**Files:**
- Modify: `backend/app/api/v1/superadmin.py`

- [ ] **Step 1: Add AuditEventOut schema and endpoint**

At the end of `backend/app/api/v1/superadmin.py`, add:

```python
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
```

Also add missing imports at the top of superadmin.py if not present:
```python
from fastapi import Query
```
and ensure `datetime` is imported:
```python
from datetime import datetime
```

- [ ] **Step 2: Verify endpoint works**

```bash
curl http://localhost:8001/api/v1/superadmin/audit \
  -H "Authorization: Bearer <sa_token>"
```
Expected: JSON array of audit events.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/v1/superadmin.py
git commit -m "feat: add GET /superadmin/audit endpoint for cross-tenant audit log"
```

---

## Chunk 3: Frontend

### Task 9: Wire ActivityTimeline to real API (frontend 8002)

**Files:**
- Modify: `frontend/src/components/dashboard/activity-timeline.tsx`
- Test: `frontend/src/components/__tests__/ActivityTimeline.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/__tests__/ActivityTimeline.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityTimeline } from '../dashboard/activity-timeline';

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue({
      data: [
        {
          id: '1',
          action: 'document_uploaded',
          severity: 'success',
          title: 'Document uploaded',
          description: 'test.pdf was uploaded',
          actor_email: 'ali@example.com',
          resource_type: 'document',
          resource_id: 'doc-1',
          detail: {},
          created_at: new Date().toISOString(),
        },
      ],
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('shows real activity events from API', async () => {
  render(<ActivityTimeline />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText('Document uploaded')).toBeInTheDocument();
  });
});

test('shows loading state initially', () => {
  render(<ActivityTimeline />, { wrapper });
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx jest src/components/__tests__/ActivityTimeline.test.tsx
```
Expected: `FAIL — text "Document uploaded" not found` (because component uses hardcoded data, not the API)

- [ ] **Step 3: Replace mock data with real API call**

Replace `frontend/src/components/dashboard/activity-timeline.tsx`:

```tsx
import { Clock, FileText, Shield, AlertTriangle, CheckCircle, LogIn } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";

interface ActivityEvent {
  id: string;
  action: string;
  severity: string;
  title: string;
  description: string | null;
  actor_email: string | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  document_uploaded: { icon: FileText,       color: "text-primary" },
  analysis_started:  { icon: Shield,         color: "text-blue-500" },
  analysis_completed:{ icon: CheckCircle,    color: "text-green-500" },
  analysis_failed:   { icon: AlertTriangle,  color: "text-destructive" },
  user_login:        { icon: LogIn,          color: "text-muted-foreground" },
};

const DEFAULT_ACTION = { icon: FileText, color: "text-muted-foreground" };

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  success: { label: "Success", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  warning: { label: "Warning", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  error:   { label: "Error",   className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  info:    { label: "Info",    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
};

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function ActivityTimeline() {
  const { data: events = [], isLoading } = useQuery<ActivityEvent[]>({
    queryKey: ["activity-recent"],
    queryFn: () => api.get("/activity?limit=5").then(r => r.data),
    refetchInterval: 30_000,
  });

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest compliance checks and system updates</CardDescription>
        </div>
        <Link to="/activity" className="text-xs text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        )}
        {!isLoading && events.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
        )}
        <div className="space-y-4">
          {events.map((event, index) => {
            const cfg = ACTION_CONFIG[event.action] ?? DEFAULT_ACTION;
            const sev = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.info;
            const Icon = cfg.icon;
            return (
              <div
                key={event.id}
                className="flex gap-4 pb-4 border-b border-border last:border-0 last:pb-0 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface ${cfg.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{event.title}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sev.className}`}>
                      {sev.label}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {timeAgo(event.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx jest src/components/__tests__/ActivityTimeline.test.tsx
```
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/activity-timeline.tsx frontend/src/components/__tests__/ActivityTimeline.test.tsx
git commit -m "feat: wire ActivityTimeline to real /activity API"
```

---

### Task 10: Create Activity.tsx full-page log (frontend 8002)

**Files:**
- Create: `frontend/src/pages/Activity.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/__tests__/Activity.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Activity from '../Activity';

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue({
      data: [
        {
          id: '1',
          action: 'user_login',
          severity: 'info',
          title: 'User signed in',
          description: 'ali@example.com signed in',
          actor_email: 'ali@example.com',
          resource_type: null,
          resource_id: null,
          detail: {},
          created_at: new Date().toISOString(),
        },
      ],
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

test('renders Activity page title', () => {
  render(<Activity />, { wrapper });
  expect(screen.getByText(/Activity Log/i)).toBeInTheDocument();
});

test('shows events from API', async () => {
  render(<Activity />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText('User signed in')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx jest src/pages/__tests__/Activity.test.tsx
```
Expected: `FAIL — Cannot find module '../Activity'`

- [ ] **Step 3: Implement Activity.tsx**

Create `frontend/src/pages/Activity.tsx`:

```tsx
import { Clock, FileText, Shield, AlertTriangle, CheckCircle, LogIn } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface ActivityEvent {
  id: string;
  action: string;
  severity: string;
  title: string;
  description: string | null;
  actor_email: string | null;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  document_uploaded:  { icon: FileText,      color: "text-primary" },
  analysis_started:   { icon: Shield,        color: "text-blue-500" },
  analysis_completed: { icon: CheckCircle,   color: "text-green-500" },
  analysis_failed:    { icon: AlertTriangle, color: "text-destructive" },
  user_login:         { icon: LogIn,         color: "text-muted-foreground" },
};
const DEFAULT_ACTION = { icon: FileText, color: "text-muted-foreground" };

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  success: { label: "Success", className: "bg-green-100 text-green-700" },
  warning: { label: "Warning", className: "bg-yellow-100 text-yellow-700" },
  error:   { label: "Error",   className: "bg-red-100 text-red-700" },
  info:    { label: "Info",    className: "bg-blue-100 text-blue-700" },
};

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(isoString).toLocaleDateString();
}

export default function Activity() {
  const { data: events = [], isLoading } = useQuery<ActivityEvent[]>({
    queryKey: ["activity-all"],
    queryFn: () => api.get("/activity?limit=100").then(r => r.data),
  });

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-muted-foreground mt-1">
          All compliance activities and system events for your organization
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Events</CardTitle>
          <CardDescription>{events.length} events recorded</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">Loading activity...</p>
          )}
          {!isLoading && events.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No activity yet. Upload a document or run an analysis to get started.
            </p>
          )}
          <div className="divide-y divide-border">
            {events.map((event) => {
              const cfg = ACTION_CONFIG[event.action] ?? DEFAULT_ACTION;
              const sev = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.info;
              const Icon = cfg.icon;
              return (
                <div key={event.id} className="flex gap-4 py-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted ${cfg.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${sev.className}`}>
                        {sev.label}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(event.created_at)}
                      </span>
                      {event.actor_email && (
                        <span className="font-mono">{event.actor_email}</span>
                      )}
                      {event.resource_type && (
                        <span className="capitalize">{event.resource_type}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Register route in App.tsx**

Find `frontend/src/App.tsx` and add:
- Import: `import Activity from "./pages/Activity";`
- Route inside the protected layout: `<Route path="/activity" element={<Activity />} />`

- [ ] **Step 5: Run test to verify it passes**

```bash
cd frontend && npx jest src/pages/__tests__/Activity.test.tsx
```
Expected: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Activity.tsx frontend/src/App.tsx frontend/src/pages/__tests__/Activity.test.tsx
git commit -m "feat: Activity.tsx full audit log page + /activity route"
```

---

### Task 11: Add activity sections to superadmin Dashboard (frontend 8003)

**Files:**
- Modify: `superadmin/src/pages/Dashboard.tsx`

- [ ] **Step 1: Add two new queries to Dashboard.tsx**

In `superadmin/src/pages/Dashboard.tsx`, add two new queries after the existing ones:

```typescript
interface AuditEvent {
  id: string;
  tenant_name: string | null;
  action: string;
  severity: string;
  title: string;
  description: string | null;
  actor_email: string | null;
  resource_type: string | null;
  created_at: string;
}

// Inside the Dashboard component:
const { data: recentEvents = [] } = useQuery<AuditEvent[]>({
  queryKey: ["sa-audit-recent"],
  queryFn: () => api.get("/superadmin/audit?limit=5").then(r => r.data),
  refetchInterval: 30_000,
});

const { data: auditEvents = [] } = useQuery<AuditEvent[]>({
  queryKey: ["sa-audit-all"],
  queryFn: () => api.get("/superadmin/audit?limit=10").then(r => r.data),
  refetchInterval: 60_000,
});
```

- [ ] **Step 2: Add severity helper and timeAgo helper**

Add these pure functions before the component:

```typescript
function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(isoString).toLocaleDateString();
}

const SEVERITY_BADGE: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  error:   "bg-red-100 text-red-700",
  info:    "bg-blue-100 text-blue-700",
};
```

- [ ] **Step 3: Add Recent Activity section to Dashboard JSX**

Inside the returned JSX, after the Processing Status section, add:

```tsx
{/* Recent Activity */}
<div className="bg-white border rounded-lg overflow-hidden">
  <div className="px-4 py-3 border-b">
    <h3 className="font-semibold text-gray-900">Recent Activity</h3>
    <p className="text-xs text-gray-400 mt-0.5">Last 5 events across all tenants</p>
  </div>
  <div className="divide-y">
    {recentEvents.length === 0 && (
      <p className="px-4 py-6 text-sm text-gray-400 text-center">No activity yet</p>
    )}
    {recentEvents.map(ev => (
      <div key={ev.id} className="px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 truncate">{ev.title}</p>
            <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_BADGE[ev.severity] ?? SEVERITY_BADGE.info}`}>
              {ev.severity}
            </span>
          </div>
          {ev.description && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{ev.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span>{timeAgo(ev.created_at)}</span>
            {ev.tenant_name && <span className="font-medium">{ev.tenant_name}</span>}
          </div>
        </div>
      </div>
    ))}
  </div>
</div>

{/* Audit Logs */}
<div className="bg-white border rounded-lg overflow-hidden">
  <div className="px-4 py-3 border-b">
    <h3 className="font-semibold text-gray-900">Audit Logs</h3>
    <p className="text-xs text-gray-400 mt-0.5">Who did what, across all tenants</p>
  </div>
  <table className="w-full text-sm">
    <thead className="bg-gray-50">
      <tr>
        {["Event", "Actor", "Tenant", "Severity", "When"].map(h => (
          <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y">
      {auditEvents.length === 0 && (
        <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-sm">No events yet</td></tr>
      )}
      {auditEvents.map(ev => (
        <tr key={ev.id} className="hover:bg-gray-50">
          <td className="px-4 py-2.5">
            <p className="font-medium text-gray-900">{ev.title}</p>
            {ev.description && <p className="text-xs text-gray-400 truncate max-w-xs">{ev.description}</p>}
          </td>
          <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{ev.actor_email || "—"}</td>
          <td className="px-4 py-2.5 text-xs text-gray-600">{ev.tenant_name || "—"}</td>
          <td className="px-4 py-2.5">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_BADGE[ev.severity] ?? SEVERITY_BADGE.info}`}>
              {ev.severity}
            </span>
          </td>
          <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(ev.created_at)}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

- [ ] **Step 4: Restart superadmin container**

```bash
docker-compose restart superadmin
```

Then visit `http://localhost:8003` → Dashboard → should show Recent Activity and Audit Logs sections.

- [ ] **Step 5: Commit**

```bash
git add superadmin/src/pages/Dashboard.tsx
git commit -m "feat: add Recent Activity + Audit Logs sections to superadmin Dashboard"
```

---

## Final Verification

- [ ] Log in at `http://localhost:8002` → check `ActivityTimeline` shows real events
- [ ] Upload a document → verify new "Document uploaded" event appears in timeline
- [ ] Run analysis → verify "Analysis started" and "Analysis completed" appear
- [ ] Visit `http://localhost:8002/activity` → verify full log page shows all events
- [ ] Log in to `http://localhost:8003` → Dashboard → verify both sections appear with real data from all tenants
- [ ] Curl `GET /superadmin/audit?tenant_id=<id>` → verify filtering works

---
