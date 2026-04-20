# Superadmin Base Documents Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Each task is independently executable.

**Goal:** Build a superadmin portal for uploading/managing base compliance documents (processed via Noesia), and update the user upload flow to a 3-step: pick type → pick base doc → upload own doc.

**Architecture:** New `BaseDocument` model (global, no tenant) stores admin-uploaded reference docs. Noesia processes them into chunks stored in Qdrant. Users select a base doc when uploading their own document for comparison. Superadmin portal uses plain Tailwind (no shadcn) matching the existing superadmin design.

**Tech Stack:** FastAPI + SQLAlchemy async, Celery, Noesia API, React 19 + TypeScript + Tailwind CSS, React Query, Axios

---

## File Map

**Backend — new/modified:**
- Create: `backend/app/db/models/base_document.py`
- Modify: `backend/app/db/models/__init__.py` — register BaseDocument
- Create: `backend/app/api/v1/base_documents.py` — all endpoints
- Modify: `backend/app/main.py` — include router
- Create: `backend/app/tasks/process_base_document.py` — Celery task

**Superadmin frontend — new/modified:**
- Modify: `superadmin/src/App.tsx` — add routes + layout
- Create: `superadmin/src/components/Layout.tsx` — sidebar nav wrapper
- Modify: `superadmin/src/pages/Dashboard.tsx` — add base doc stats
- Create: `superadmin/src/pages/Documents.tsx` — list + filters + upload form
- Create: `superadmin/src/pages/DocumentDetail.tsx` — chunks + search + delete

**User frontend — modified:**
- Modify: `frontend/src/pages/Upload.tsx` — 3-step flow

---

## Chunk 1: Backend — BaseDocument Model + API

### Task 1: BaseDocument model

**Files:**
- Create: `backend/app/db/models/base_document.py`
- Modify: `backend/app/db/models/__init__.py`

- [ ] **Step 1: Create the model**

Create `backend/app/db/models/base_document.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

DOC_TYPES = ("GDPR", "SOX", "HIPAA", "ISO 27001", "CCPA", "PCI DSS", "Others")


class BaseDocument(Base):
    """Admin-uploaded reference/compliance standard document."""

    __tablename__ = "base_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)  # GDPR | SOX | HIPAA | ISO 27001 | CCPA | PCI DSS | Others
    processing_status: Mapped[str] = mapped_column(String(30), default="pending")  # pending | processing | completed | failed
    noesia_document_id: Mapped[str | None] = mapped_column(String(255))
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    file_path: Mapped[str | None] = mapped_column(Text)  # path on disk
    file_size: Mapped[int | None] = mapped_column(Integer)
    uploaded_by: Mapped[str] = mapped_column(String(100), default="superadmin")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
```

- [ ] **Step 2: Register model in `__init__.py`**

Add to `backend/app/db/models/__init__.py`:

```python
from app.db.models.base_document import BaseDocument  # noqa: F401
```

---

### Task 2: Celery task for base document processing

**Files:**
- Create: `backend/app/tasks/process_base_document.py`

- [ ] **Step 1: Create the processing task**

Create `backend/app/tasks/process_base_document.py`:

```python
"""Process a base document through Noesia ingest pipeline."""
import asyncio
import logging
import os
import uuid

from app.db.models.base_document import BaseDocument
from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
from app.services.noesia import NoesiaError, noesia_client
from app.worker import celery_app

logger = logging.getLogger(__name__)

COLLECTION_NAME = "mizan_base_documents"


async def _process_base_document(doc_id: str, file_path: str) -> None:
    doc_uuid = uuid.UUID(doc_id)

    async with AsyncSessionLocal() as db:
        doc = await db.get(BaseDocument, doc_uuid)
        if not doc:
            logger.warning("BaseDocument %s not found", doc_id)
            return

        doc.processing_status = "processing"
        await db.commit()

        try:
            with open(file_path, "rb") as f:
                content = f.read()

            import mimetypes
            content_type = mimetypes.guess_type(doc.filename)[0] or "application/octet-stream"

            # Step 1: Upload to Noesia
            upload_results = await noesia_client.upload_documents([
                (doc.filename, content, content_type, str(doc.id), doc.filename)
            ])
            noesia_doc_id = upload_results[0][0]
            doc.noesia_document_id = noesia_doc_id
            await db.commit()

            # Step 2: Ingest job
            ingest_result = await noesia_client.ingest_documents(
                document_pairs=[(noesia_doc_id, str(doc.id))],
                collection_name=COLLECTION_NAME,
                project_id=f"base_{str(doc.id)[:8]}",
                idempotency_key=f"base-{doc.id}",
            )

            # Step 3: Poll until done
            job_id = ingest_result.job_id
            for _ in range(60):
                await asyncio.sleep(5)
                status = await noesia_client.get_job_status(job_id)
                if status.get("status") == "completed":
                    break
                if status.get("status") == "failed":
                    raise RuntimeError(f"Noesia job failed: {status}")

            # Step 4: Get chunk count from Qdrant
            from app.services.qdrant_search import scroll_chunks_by_noesia_id
            chunks = await scroll_chunks_by_noesia_id(noesia_doc_id, limit=1000)
            doc.chunk_count = len(chunks)
            doc.processing_status = "completed"
            await db.commit()

        except Exception as e:
            logger.exception("Failed to process base document %s: %s", doc_id, e)
            async with AsyncSessionLocal() as db2:
                doc2 = await db2.get(BaseDocument, doc_uuid)
                if doc2:
                    doc2.processing_status = "failed"
                    await db2.commit()
        finally:
            # Clean up temp file
            try:
                os.remove(file_path)
            except OSError:
                pass


@celery_app.task(name="tasks.process_base_document")
def process_base_document_task(doc_id: str, file_path: str) -> None:
    asyncio.run(_process_base_document(doc_id, file_path))
```

---

### Task 3: Base documents API endpoints

**Files:**
- Create: `backend/app/api/v1/base_documents.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create the API router**

Create `backend/app/api/v1/base_documents.py`:

```python
"""Base document endpoints — superadmin upload/manage, users read."""
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.api.v1.superadmin import require_superadmin
from app.db.models.base_document import DOC_TYPES, BaseDocument
from app.db.session import get_db
from app.tasks.process_base_document import process_base_document_task

router = APIRouter(tags=["base-documents"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/tmp/mizan-uploads")


class BaseDocOut(BaseModel):
    id: str
    filename: str
    doc_type: str
    processing_status: str
    chunk_count: int
    file_size: int | None
    uploaded_by: str
    created_at: datetime


class BaseDocStats(BaseModel):
    total: int
    by_type: dict[str, int]
    by_status: dict[str, int]


# ── Superadmin endpoints ──────────────────────────────────────────────────────

@router.get("/superadmin/base-documents/stats", response_model=BaseDocStats)
async def get_stats(_=Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BaseDocument))
    docs = result.scalars().all()
    by_type: dict[str, int] = {}
    by_status: dict[str, int] = {}
    for d in docs:
        by_type[d.doc_type] = by_type.get(d.doc_type, 0) + 1
        by_status[d.processing_status] = by_status.get(d.processing_status, 0) + 1
    return BaseDocStats(total=len(docs), by_type=by_type, by_status=by_status)


@router.get("/superadmin/base-documents", response_model=list[BaseDocOut])
async def list_base_docs(
    doc_type: str | None = None,
    status: str | None = None,
    _=Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    q = select(BaseDocument).order_by(BaseDocument.created_at.desc())
    if doc_type:
        q = q.where(BaseDocument.doc_type == doc_type)
    if status:
        q = q.where(BaseDocument.processing_status == status)
    result = await db.execute(q)
    docs = result.scalars().all()
    return [_to_out(d) for d in docs]


@router.post("/superadmin/base-documents", response_model=BaseDocOut, status_code=201)
async def upload_base_doc(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    _=Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    if doc_type not in DOC_TYPES:
        raise HTTPException(status_code=422, detail=f"doc_type must be one of: {', '.join(DOC_TYPES)}")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    doc_id = uuid.uuid4()
    ext = os.path.splitext(file.filename or "upload")[1] or ".bin"
    file_path = os.path.join(UPLOAD_DIR, f"base_{doc_id}{ext}")

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    doc = BaseDocument(
        id=doc_id,
        filename=file.filename or f"document{ext}",
        doc_type=doc_type,
        file_path=file_path,
        file_size=len(content),
        processing_status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Kick off Celery task
    process_base_document_task.delay(str(doc.id), file_path)

    return _to_out(doc)


@router.get("/superadmin/base-documents/{doc_id}", response_model=BaseDocOut)
async def get_base_doc(doc_id: str, _=Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    doc = await db.get(BaseDocument, uuid.UUID(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return _to_out(doc)


@router.get("/superadmin/base-documents/{doc_id}/chunks")
async def get_chunks(
    doc_id: str,
    q: str | None = None,
    _=Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(BaseDocument, uuid.UUID(doc_id))
    if not doc or not doc.noesia_document_id:
        raise HTTPException(status_code=404, detail="Not found or not yet processed")

    from app.services.qdrant_search import scroll_chunks_by_noesia_id
    chunks = await scroll_chunks_by_noesia_id(doc.noesia_document_id, limit=500)

    if q:
        q_lower = q.lower()
        chunks = [c for c in chunks if q_lower in str(c.get("text", "")).lower()]

    return {"chunks": chunks, "total": len(chunks)}


@router.delete("/superadmin/base-documents/{doc_id}", status_code=204)
async def delete_base_doc(doc_id: str, _=Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    doc = await db.get(BaseDocument, uuid.UUID(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(doc)
    await db.commit()


# ── User-facing endpoint ──────────────────────────────────────────────────────

@router.get("/base-documents", response_model=list[BaseDocOut])
async def list_base_docs_for_users(
    doc_type: str | None = None,
    _=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Users fetch available base documents to compare against."""
    q = select(BaseDocument).where(
        BaseDocument.processing_status == "completed"
    ).order_by(BaseDocument.created_at.desc())
    if doc_type:
        q = q.where(BaseDocument.doc_type == doc_type)
    result = await db.execute(q)
    return [_to_out(d) for d in result.scalars().all()]


def _to_out(d: BaseDocument) -> BaseDocOut:
    return BaseDocOut(
        id=str(d.id),
        filename=d.filename,
        doc_type=d.doc_type,
        processing_status=d.processing_status,
        chunk_count=d.chunk_count,
        file_size=d.file_size,
        uploaded_by=d.uploaded_by,
        created_at=d.created_at,
    )
```

- [ ] **Step 2: Register router in `main.py`**

In `backend/app/main.py`, add after the existing imports:

```python
from app.api.v1 import base_documents
```

And after the existing `app.include_router` lines:

```python
app.include_router(base_documents.router, prefix="/api/v1")
```

- [ ] **Step 3: Verify backend starts cleanly**

```bash
docker-compose up backend -d
docker logs mizan-backend-1 --tail 20
```

Expected: `Application startup complete.` with no errors.

---

## Chunk 2: Superadmin Frontend — Layout + Dashboard

### Task 4: Shared layout with sidebar

**Files:**
- Create: `superadmin/src/components/Layout.tsx`
- Modify: `superadmin/src/App.tsx`

- [ ] **Step 1: Create Layout component**

Create `superadmin/src/components/Layout.tsx`:

```tsx
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, LogOut } from "lucide-react";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Base Documents", url: "/documents", icon: FileText },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("sa_token");
    navigate("/login");
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-700">
          <h1 className="text-white font-bold text-base">Mizan Superadmin</h1>
          <p className="text-slate-400 text-xs mt-0.5">System administration</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-slate-700 text-white font-medium"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`
              }
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.title}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-700">
          <button
            onClick={logout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx to use Layout**

Replace `superadmin/src/App.tsx` with:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";
import DocumentDetail from "./pages/DocumentDetail";
import Layout from "./components/Layout";

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("sa_token");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout><Dashboard /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/documents"
            element={
              <RequireAuth>
                <Layout><Documents /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/documents/:id"
            element={
              <RequireAuth>
                <Layout><DocumentDetail /></Layout>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Verify superadmin package has react-query**

```bash
cat superadmin/package.json | grep tanstack
```

If missing, run: `cd superadmin && npm install @tanstack/react-query`

---

### Task 5: Update Dashboard with base document stats

**Files:**
- Modify: `superadmin/src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace Dashboard.tsx**

Replace `superadmin/src/pages/Dashboard.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Stats { tenants: number; users: number; }
interface Tenant { id: string; name: string; slug: string; plan: string; is_active: boolean; created_at: string; }
interface BaseDocStats { total: number; by_type: Record<string, number>; by_status: Record<string, number>; }

const DOC_TYPES = ["GDPR", "SOX", "HIPAA", "ISO 27001", "CCPA", "PCI DSS", "Others"];
const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function Dashboard() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ["sa-stats"],
    queryFn: () => api.get("/superadmin/stats").then(r => r.data),
  });
  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["sa-tenants"],
    queryFn: () => api.get("/superadmin/tenants").then(r => r.data),
  });
  const { data: docStats } = useQuery<BaseDocStats>({
    queryKey: ["sa-base-doc-stats"],
    queryFn: () => api.get("/superadmin/base-documents/stats").then(r => r.data),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">System overview</p>
      </div>

      {/* System stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Tenants", value: stats?.tenants ?? "—" },
          { label: "Users", value: stats?.users ?? "—" },
          { label: "Base Documents", value: docStats?.total ?? "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border rounded-lg p-4">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Base docs by type */}
      {docStats && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900">Base Documents by Type</h3>
          </div>
          <div className="p-4 grid grid-cols-4 gap-3">
            {DOC_TYPES.map(type => (
              <div key={type} className="border rounded-md p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{docStats.by_type[type] ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">{type}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Base docs by status */}
      {docStats && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900">Processing Status</h3>
          </div>
          <div className="p-4 flex gap-3 flex-wrap">
            {Object.entries(docStats.by_status).map(([status, count]) => (
              <span key={status} className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
                {status}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tenants table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-900">Tenants</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Name", "Slug", "Plan", "Status", "Created"].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenants.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{t.name}</td>
                <td className="px-4 py-2 text-gray-500 font-mono text-xs">{t.slug}</td>
                <td className="px-4 py-2">{t.plan}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {t.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-400 text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No tenants yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## Chunk 3: Superadmin Frontend — Documents List + Upload

### Task 6: Documents list page with upload

**Files:**
- Create: `superadmin/src/pages/Documents.tsx`

- [ ] **Step 1: Create Documents.tsx**

Create `superadmin/src/pages/Documents.tsx`:

```tsx
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Upload, FileText, Eye } from "lucide-react";

interface BaseDoc {
  id: string; filename: string; doc_type: string;
  processing_status: string; chunk_count: number;
  file_size: number | null; created_at: string;
}

const DOC_TYPES = ["GDPR", "SOX", "HIPAA", "ISO 27001", "CCPA", "PCI DSS", "Others"];

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function Documents() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");

  const { data: docs = [], isLoading } = useQuery<BaseDoc[]>({
    queryKey: ["base-docs", typeFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (typeFilter) params.set("doc_type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      return api.get(`/superadmin/base-documents?${params}`).then(r => r.data);
    },
    refetchInterval: 5000,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !uploadType) throw new Error("Missing file or type");
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("doc_type", uploadType);
      return api.post("/superadmin/base-documents", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["base-docs"] });
      qc.invalidateQueries({ queryKey: ["sa-base-doc-stats"] });
      setShowUpload(false);
      setSelectedFile(null);
      setUploadType("");
      setUploadError("");
    },
    onError: (e: any) => {
      setUploadError(e.response?.data?.detail || "Upload failed");
    },
  });

  function formatSize(bytes: number | null) {
    if (!bytes) return "—";
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Base Documents</h2>
          <p className="text-sm text-gray-500 mt-0.5">Compliance reference documents for user comparison</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-slate-800 transition-colors"
        >
          <Upload className="h-4 w-4" />
          Upload Document
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="bg-white border rounded-lg p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Upload New Base Document</h3>

          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-slate-400 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                <FileText className="h-5 w-5 text-slate-500" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-gray-400">({formatSize(selectedFile.size)})</span>
              </div>
            ) : (
              <div>
                <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600 font-medium">Click to choose a file</p>
                <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX, TXT supported</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt"
              onChange={e => setSelectedFile(e.target.files?.[0] || null)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
            <select
              value={uploadType}
              onChange={e => setUploadType(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value="">Select type...</option>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={!selectedFile || !uploadType || uploadMutation.isPending}
              className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload & Process"}
            </button>
            <button
              onClick={() => { setShowUpload(false); setSelectedFile(null); setUploadType(""); setUploadError(""); }}
              className="text-sm text-gray-600 px-4 py-2 rounded-md border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <option value="">All Types</option>
          {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <option value="">All Statuses</option>
          {["pending", "processing", "completed", "failed"].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Filename", "Type", "Status", "Chunks", "Size", "Uploaded", ""].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {!isLoading && docs.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No documents yet</td></tr>
            )}
            {docs.map(doc => (
              <tr key={doc.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-gray-900 truncate max-w-xs">{doc.filename}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className="bg-slate-100 text-slate-700 text-xs font-medium px-2 py-0.5 rounded">{doc.doc_type}</span>
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[doc.processing_status] ?? "bg-gray-100 text-gray-600"}`}>
                    {doc.processing_status}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-600">{doc.chunk_count || "—"}</td>
                <td className="px-4 py-2 text-gray-500">{formatSize(doc.file_size)}</td>
                <td className="px-4 py-2 text-gray-400 text-xs">{new Date(doc.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2">
                  <Link
                    to={`/documents/${doc.id}`}
                    className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-medium"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## Chunk 4: Superadmin Frontend — Document Detail

### Task 7: Document detail with chunks + search + delete

**Files:**
- Create: `superadmin/src/pages/DocumentDetail.tsx`

- [ ] **Step 1: Create DocumentDetail.tsx**

Create `superadmin/src/pages/DocumentDetail.tsx`:

```tsx
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, Trash2, Search, FileText } from "lucide-react";

interface BaseDoc {
  id: string; filename: string; doc_type: string;
  processing_status: string; chunk_count: number;
  file_size: number | null; uploaded_by: string; created_at: string;
}

interface ChunksResponse {
  chunks: Array<{ text?: string; page?: number; [key: string]: any }>;
  total: number;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: doc, isLoading: docLoading } = useQuery<BaseDoc>({
    queryKey: ["base-doc", id],
    queryFn: () => api.get(`/superadmin/base-documents/${id}`).then(r => r.data),
    refetchInterval: (data) => data?.processing_status === "processing" || data?.processing_status === "pending" ? 3000 : false,
  });

  const { data: chunksData, isLoading: chunksLoading } = useQuery<ChunksResponse>({
    queryKey: ["base-doc-chunks", id, searchQuery],
    queryFn: () => {
      const params = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : "";
      return api.get(`/superadmin/base-documents/${id}/chunks${params}`).then(r => r.data);
    },
    enabled: doc?.processing_status === "completed",
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/superadmin/base-documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["base-docs"] });
      navigate("/documents");
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(search);
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return "—";
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  if (docLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  }
  if (!doc) {
    return <div className="p-6 text-sm text-red-600">Document not found.</div>;
  }

  const isProcessing = doc.processing_status === "processing" || doc.processing_status === "pending";

  return (
    <div className="p-6 space-y-6">
      {/* Back + Header */}
      <div>
        <Link to="/documents" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Documents
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-slate-100 rounded-lg mt-0.5">
              <FileText className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{doc.filename}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-slate-100 text-slate-700 text-xs font-medium px-2 py-0.5 rounded">{doc.doc_type}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[doc.processing_status] ?? "bg-gray-100"}`}>
                  {doc.processing_status}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium px-3 py-1.5 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800 font-medium">Are you sure you want to delete this document?</p>
          <p className="text-xs text-red-600 mt-1">This action cannot be undone.</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-red-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMutation.isPending ? "Deleting..." : "Yes, Delete"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="text-sm text-gray-600 px-3 py-1.5 rounded-md border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Meta info */}
      <div className="bg-white border rounded-lg p-4 grid grid-cols-4 gap-4 text-sm">
        {[
          { label: "Chunks", value: doc.chunk_count || (isProcessing ? "Processing..." : "—") },
          { label: "File Size", value: formatSize(doc.file_size) },
          { label: "Uploaded by", value: doc.uploaded_by },
          { label: "Created", value: new Date(doc.created_at).toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-gray-500 uppercase font-medium">{label}</p>
            <p className="font-medium text-gray-900 mt-0.5">{String(value)}</p>
          </div>
        ))}
      </div>

      {/* Processing notice */}
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          Document is being processed through Noesia. Chunks will appear here once complete. Page auto-refreshes.
        </div>
      )}

      {/* Chunks section */}
      {doc.processing_status === "completed" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">
              Chunks {chunksData ? `(${chunksData.total})` : ""}
            </h3>
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search chunks..."
                  className="border rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 w-56"
                />
              </div>
              <button
                type="submit"
                className="bg-slate-900 text-white text-sm px-3 py-1.5 rounded-md hover:bg-slate-800"
              >
                Search
              </button>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setSearchQuery(""); }}
                  className="text-sm text-gray-500 px-3 py-1.5 rounded-md border hover:bg-gray-50"
                >
                  Clear
                </button>
              )}
            </form>
          </div>

          {chunksLoading && <p className="text-sm text-gray-400">Loading chunks...</p>}

          {chunksData?.chunks.length === 0 && (
            <div className="bg-white border rounded-lg p-8 text-center text-gray-400 text-sm">
              {searchQuery ? `No chunks matching "${searchQuery}"` : "No chunks found"}
            </div>
          )}

          <div className="space-y-2">
            {chunksData?.chunks.map((chunk, i) => (
              <div key={i} className="bg-white border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">Chunk {i + 1}</span>
                  {chunk.page && (
                    <span className="text-xs text-gray-400">Page {chunk.page}</span>
                  )}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {chunk.text || JSON.stringify(chunk, null, 2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Chunk 5: User Frontend — 3-Step Upload Flow

### Task 8: Update user Upload page

**Files:**
- Modify: `frontend/src/pages/Upload.tsx`

- [ ] **Step 1: Replace Upload.tsx with 3-step flow**

Replace `frontend/src/pages/Upload.tsx` with:

```tsx
import { useState, useCallback, useRef } from "react";
import { Upload as UploadIcon, FileText, CheckCircle, ChevronRight, Search } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

const DOC_TYPES = ["GDPR", "SOX", "HIPAA", "ISO 27001", "CCPA", "PCI DSS", "Others"];

interface BaseDoc {
  id: string; filename: string; doc_type: string;
  processing_status: string; chunk_count: number;
}

type Step = 1 | 2 | 3;

export default function Upload() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [selectedType, setSelectedType] = useState("");
  const [selectedBaseDoc, setSelectedBaseDoc] = useState<BaseDoc | null>(null);
  const [userFile, setUserFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const { data: baseDocs = [], isLoading: docsLoading } = useQuery<BaseDoc[]>({
    queryKey: ["base-docs-user", selectedType],
    queryFn: () => {
      const params = selectedType ? `?doc_type=${encodeURIComponent(selectedType)}` : "";
      return api.get(`/base-documents${params}`).then(r => r.data);
    },
    enabled: step === 2,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!userFile || !selectedBaseDoc) throw new Error("Missing file or base document");
      const form = new FormData();
      form.append("file", userFile);
      form.append("base_document_id", selectedBaseDoc.id);
      form.append("doc_type", selectedType);
      return api.post("/documents/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => setUploadSuccess(true),
    onError: (e: any) => setUploadError(e.response?.data?.detail || "Upload failed"),
  });

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setUserFile(file);
  }, []);

  function reset() {
    setStep(1); setSelectedType(""); setSelectedBaseDoc(null);
    setUserFile(null); setUploadSuccess(false); setUploadError("");
  }

  if (uploadSuccess) {
    return (
      <div className="flex-1 p-8 animate-fade-in">
        <Card className="max-w-md mx-auto text-center p-8">
          <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Document Uploaded</h3>
          <p className="text-text-secondary text-sm mb-6">Your document is being processed and compared against the selected base document.</p>
          <Button onClick={reset}>Upload Another</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-8 animate-fade-in">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Upload Document</h1>
        <p className="text-text-secondary mt-2">Upload your document for compliance comparison.</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              step > s ? "bg-success text-white" : step === s ? "bg-accent-600 text-white" : "bg-muted text-muted-foreground"
            }`}>
              {step > s ? <CheckCircle className="h-4 w-4" /> : s}
            </div>
            <span className={`text-sm ${step === s ? "font-medium text-foreground" : "text-text-secondary"}`}>
              {s === 1 ? "Select Type" : s === 2 ? "Choose Base Document" : "Upload Your Document"}
            </span>
            {i < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Type */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select Document Type</CardTitle>
            <CardDescription>What type of compliance standard does your document relate to?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {DOC_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => { setSelectedType(type); setStep(2); }}
                  className={`p-4 rounded-lg border-2 text-left transition-all hover:border-accent-600 hover:bg-accent-600/5 ${
                    selectedType === type ? "border-accent-600 bg-accent-600/5" : "border-border"
                  }`}
                >
                  <p className="font-semibold text-sm">{type}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Choose Base Document */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Choose Base Document</CardTitle>
                <CardDescription>
                  Select the <Badge variant="outline">{selectedType}</Badge> reference document to compare against.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>Change Type</Button>
            </div>
          </CardHeader>
          <CardContent>
            {docsLoading && <p className="text-sm text-text-secondary">Loading documents...</p>}
            {!docsLoading && baseDocs.length === 0 && (
              <div className="text-center py-8">
                <FileText className="h-10 w-10 mx-auto text-text-muted mb-3" />
                <p className="text-sm font-medium">No base documents available</p>
                <p className="text-xs text-text-secondary mt-1">No {selectedType} documents have been uploaded by the admin yet.</p>
              </div>
            )}
            <div className="space-y-2">
              {baseDocs.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => { setSelectedBaseDoc(doc); setStep(3); }}
                  className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-all hover:border-accent-600 hover:bg-accent-600/5 ${
                    selectedBaseDoc?.id === doc.id ? "border-accent-600 bg-accent-600/5" : "border-border"
                  }`}
                >
                  <FileText className="h-5 w-5 text-text-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{doc.filename}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{doc.chunk_count} chunks</p>
                  </div>
                  <Badge variant="outline">{doc.doc_type}</Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Upload user file */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Upload Your Document</CardTitle>
                <CardDescription>
                  Comparing against: <span className="font-medium">{selectedBaseDoc?.filename}</span>
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>Change Base Doc</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                isDragging ? "border-accent-600 bg-accent-600/5" : "border-border hover:border-accent-600/50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              {userFile ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle className="h-8 w-8 text-success" />
                  <p className="font-medium text-sm">{userFile.name}</p>
                  <p className="text-xs text-text-secondary">{(userFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <UploadIcon className="h-8 w-8 text-text-muted" />
                  <p className="font-medium text-sm">Drag & drop or click to browse</p>
                  <p className="text-xs text-text-secondary">PDF, DOC, DOCX, TXT</p>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.txt"
                onChange={e => setUserFile(e.target.files?.[0] || null)}
              />
            </div>

            {uploadError && <p className="text-sm text-critical">{uploadError}</p>}

            <Button
              className="w-full"
              onClick={() => uploadMutation.mutate()}
              disabled={!userFile || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload & Compare"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

---

## Chunk 6: Final — Rebuild & Verify

### Task 9: Install dependencies + rebuild containers

- [ ] **Step 1: Check superadmin has required deps**

```bash
cat superadmin/package.json | grep -E "react-router|tanstack|lucide|axios"
```

If missing any, run inside the superadmin dir:
```bash
cd superadmin && npm install react-router-dom @tanstack/react-query lucide-react axios
```

- [ ] **Step 2: Rebuild and restart all containers**

```bash
cd c:/Personal/Projects/mizan && docker-compose up --build -d
```

- [ ] **Step 3: Verify backend has new endpoints**

```bash
sleep 10 && curl -s http://localhost:8001/api/v1/docs | grep -q "base" && echo "OK" || echo "check logs"
docker logs mizan-backend-1 --tail 20
```

- [ ] **Step 4: Verify superadmin portal loads**

```bash
curl -s http://localhost:8003/ -o /dev/null -w "Superadmin: HTTP %{http_code}\n"
curl -s http://localhost:8002/ -o /dev/null -w "Frontend: HTTP %{http_code}\n"
```

Expected: both return `HTTP 200`
