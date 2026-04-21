# Document Upload Pipeline with Chunk Persistence

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to upload documents against base documents, process through Noesia API, persist chunks to database, and view chunks in a modal interface.

**Architecture:** Upload triggers Celery task that processes document through Noesia (reusing superadmin logic), stores chunks in MizanDocumentChunk, and links to base document. Frontend displays real data with random scores and new "View Chunks" modal showing chunks + extracted content in tabs.

**Tech Stack:** FastAPI, SQLAlchemy async, Celery, React, React Query, TypeScript, Tailwind CSS

---

## File Structure

**Backend (New/Modified):**
- Create: `backend/app/db/models/mizan_document_chunk.py` — Chunk storage model
- Modify: `backend/app/db/models/document.py` — Add base_document_id FK
- Create: `backend/app/tasks/process_user_document.py` — Celery task (reuse superadmin logic)
- Modify: `backend/app/api/v1/documents.py` — Add /documents/{id}/chunks endpoint
- Modify: `backend/app/db/models/__init__.py` — Register new model

**Frontend (New/Modified):**
- Create: `frontend/src/components/ChunksModal.tsx` — Modal with chunks + document tabs
- Create: `frontend/src/components/ChunksList.tsx` — Searchable chunks list (reuse superadmin logic)
- Create: `frontend/src/components/ExtractedContentView.tsx` — Extracted content display
- Modify: `frontend/src/pages/Documents.tsx` — Fetch real data, add random scores, integrate ChunksModal
- Modify: `frontend/src/lib/api.ts` — Add chunk fetching hook (if needed)

---

## Chunk 1: Backend Database & Models

### Task 1: Create MizanDocumentChunk Model

**Files:**
- Create: `backend/app/db/models/mizan_document_chunk.py`

- [ ] **Step 1: Create MizanDocumentChunk model**

```python
import uuid
from datetime import datetime
from sqlalchemy import ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class MizanDocumentChunk(Base):
    """Chunks extracted from a MizanDocument via Noesia."""

    __tablename__ = "mizan_document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mizan_document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("mizan_documents.id", ondelete="CASCADE"))
    chunk_index: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    section_header: Mapped[str | None] = mapped_column(String(500))
    section_level: Mapped[int | None] = mapped_column(Integer)
    document_name: Mapped[str] = mapped_column(String(500))
    metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    mizan_document: Mapped["MizanDocument"] = relationship("MizanDocument", back_populates="chunks")
```

- [ ] **Step 2: Register in __init__.py**

Modify `backend/app/db/models/__init__.py`:
```python
from app.db.models.mizan_document_chunk import MizanDocumentChunk

__all__ = [
    # ... existing exports
    "MizanDocumentChunk",
]
```

- [ ] **Step 3: Update MizanDocument model**

Modify `backend/app/db/models/document.py`:
- Add after line 42 (before closing class):
```python
    base_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("base_documents.id"))
    chunks: Mapped[list["MizanDocumentChunk"]] = relationship("MizanDocumentChunk", back_populates="mizan_document", cascade="all, delete-orphan")
```

- [ ] **Step 4: Commit**

```bash
cd c:/Personal/Projects/mizan
git add backend/app/db/models/mizan_document_chunk.py backend/app/db/models/document.py backend/app/db/models/__init__.py
git commit -m "feat: add MizanDocumentChunk model and base_document_id to MizanDocument"
```

---

### Task 2: Create Celery Task for User Document Processing

**Files:**
- Create: `backend/app/tasks/process_user_document.py`

- [ ] **Step 1: Create task (reuse superadmin logic)**

```python
"""Process user-uploaded documents through Noesia and store chunks."""
import asyncio
import os
import uuid
from app.db.session import WorkerAsyncSessionLocal
from app.db.models.document import MizanDocument
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.services.noesia import noesia_client
from app.worker import celery_app
import logging

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, max_retries=2)
def process_user_document_task(self, document_id: str, file_path: str):
    """
    Process user document: upload to Noesia → ingest → fetch chunks → store in DB.
    
    Args:
        document_id: UUID of MizanDocument
        file_path: Path to uploaded file
    """
    try:
        asyncio.run(_process_document(document_id, file_path))
    except Exception as e:
        logger.error(f"Error processing document {document_id}: {e}")
        raise

async def _process_document(document_id: str, file_path: str):
    """Async document processing pipeline."""
    async with WorkerAsyncSessionLocal() as db:
        doc = await db.get(MizanDocument, uuid.UUID(document_id))
        if not doc:
            logger.error(f"Document {document_id} not found")
            return

        try:
            # Update status to processing
            doc.processing_status = "processing"
            await db.commit()

            # Reconstruct filename with UUID for Noesia (matches superadmin pattern)
            stem, ext = os.path.splitext(doc.name)
            noesia_filename = f"{stem}_{str(doc.id).replace('-', '')}{ext}"

            # Upload to Noesia
            logger.info(f"Uploading {noesia_filename} to Noesia")
            upload_result = await noesia_client.upload_document(file_path, noesia_filename)
            
            # Create ingest job and wait for completion
            logger.info(f"Creating ingest job for {noesia_filename}")
            ingest_job = await noesia_client.create_ingest_job(noesia_filename)
            doc.noesia_document_id = ingest_job.get("document_id")
            
            # Poll for completion
            await noesia_client.wait_for_ingest_completion(noesia_filename)

            # Fetch chunks from Noesia
            logger.info(f"Fetching chunks for {noesia_filename}")
            chunks_response = await noesia_client.get_chunks(noesia_filename)
            chunks = chunks_response.get("chunks", [])

            # Save chunks to database
            for idx, chunk in enumerate(chunks):
                chunk_obj = MizanDocumentChunk(
                    mizan_document_id=doc.id,
                    chunk_index=idx,
                    text=chunk.get("text", ""),
                    section_header=chunk.get("metadata", {}).get("section_header"),
                    section_level=chunk.get("metadata", {}).get("section_level"),
                    document_name=chunk.get("metadata", {}).get("document_name", doc.name),
                    metadata=chunk.get("metadata", {}),
                )
                db.add(chunk_obj)

            doc.noesia_chunk_count = len(chunks)
            doc.processing_status = "completed"
            await db.commit()
            logger.info(f"Successfully processed {document_id} with {len(chunks)} chunks")

        except Exception as e:
            doc.processing_status = "failed"
            await db.commit()
            logger.error(f"Failed to process document {document_id}: {e}")
            raise
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/tasks/process_user_document.py
git commit -m "feat: create Celery task for user document processing with chunk persistence"
```

---

### Task 3: Add /documents/{id}/chunks Endpoint

**Files:**
- Modify: `backend/app/api/v1/documents.py`

- [ ] **Step 1: Add chunks endpoint**

Append to `backend/app/api/v1/documents.py`:

```python
@router.get("/{document_id}/chunks")
async def get_document_chunks(
    project_id: str,
    document_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch chunks for a user-uploaded document."""
    from sqlalchemy import and_
    from app.db.models.mizan_document_chunk import MizanDocumentChunk
    
    # Verify document exists and user has access
    doc_uuid = uuid.UUID(document_id)
    project = await _get_project(project_id, user, db)
    
    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.project_id != project.id:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if doc.processing_status != "completed":
        raise HTTPException(status_code=400, detail=f"Document not ready (status: {doc.processing_status})")
    
    # Fetch chunks
    result = await db.execute(
        select(MizanDocumentChunk)
        .where(MizanDocumentChunk.mizan_document_id == doc_uuid)
        .order_by(MizanDocumentChunk.chunk_index)
    )
    chunks = result.scalars().all()
    
    # Format response (match superadmin format for component reuse)
    chunk_dicts = [
        {
            "id": str(c.id),
            "text": c.text,
            "metadata": {
                "section_header": c.section_header,
                "section_level": c.section_level,
                "chunk_index": c.chunk_index,
                "document_name": c.document_name,
            },
        }
        for c in chunks
    ]
    
    return {"chunks": chunk_dicts, "total": len(chunk_dicts)}
```

- [ ] **Step 2: Update imports**

Add to imports at top of `documents.py`:
```python
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.tasks.process_user_document import process_user_document_task
```

- [ ] **Step 3: Update upload endpoint to trigger task**

Find `upload_document` function (around line 59) and update it to trigger task:

```python
# After db.commit() for new document, add:
process_user_document_task.delay(str(new_doc.id), file_path)
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/documents.py
git commit -m "feat: add /documents/{id}/chunks endpoint and trigger processing task on upload"
```

---

## Chunk 2: Frontend Components & Pages

### Task 4: Create ChunksModal Component

**Files:**
- Create: `frontend/src/components/ChunksModal.tsx`

- [ ] **Step 1: Create ChunksModal**

```typescript
import { useState } from "react";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { ChunksList } from "./ChunksList";
import { ExtractedContentView } from "./ExtractedContentView";

interface Chunk {
  id?: string;
  text?: string;
  metadata?: {
    section_header?: string;
    section_level?: number;
    chunk_index?: number;
    document_name?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface ChunksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  projectId: string;
  documentName: string;
}

export function ChunksModal({
  open,
  onOpenChange,
  documentId,
  projectId,
  documentName,
}: ChunksModalProps) {
  const [activeTab, setActiveTab] = useState<"chunks" | "document">("chunks");

  const { data: chunksData, isLoading } = useQuery({
    queryKey: ["document-chunks", documentId],
    queryFn: () =>
      api
        .get(`/projects/${projectId}/documents/${documentId}/chunks`)
        .then((r) => r.data),
    enabled: open,
  });

  const chunks = chunksData?.chunks || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Document Chunks - {documentName}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab("chunks")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "chunks"
                ? "text-slate-900 border-b-2 border-slate-900 -mb-px"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Chunks
          </button>
          <button
            onClick={() => setActiveTab("document")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "document"
                ? "text-slate-900 border-b-2 border-slate-900 -mb-px"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Document
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "chunks" && (
            <ChunksList chunks={chunks} isLoading={isLoading} />
          )}
          {activeTab === "document" && (
            <ExtractedContentView chunks={chunks} isLoading={isLoading} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd c:/Personal/Projects/mizan/frontend
git add src/components/ChunksModal.tsx
git commit -m "feat: create ChunksModal component with tabs"
```

---

### Task 5: Create ChunksList Component

**Files:**
- Create: `frontend/src/components/ChunksList.tsx`

- [ ] **Step 1: Create ChunksList (reuse superadmin pattern)**

```typescript
import { useState } from "react";
import { Search, X } from "lucide-react";

interface Chunk {
  id?: string;
  text?: string;
  metadata?: {
    section_header?: string;
    section_level?: number;
    chunk_index?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

interface ChunksListProps {
  chunks: Chunk[];
  isLoading: boolean;
}

interface ChunkDetailPanel {
  chunk: Chunk;
  onClose: () => void;
}

function ChunkDetailPanel({ chunk, onClose }: ChunkDetailPanel) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col min-w-0">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-gray-900">
          {chunk.metadata?.section_header || "Chunk Detail"}
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm text-gray-700 whitespace-pre-wrap">
          {chunk.text}
        </p>
        {chunk.metadata && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Metadata
            </h4>
            <dl className="space-y-2 text-xs">
              {chunk.metadata.section_level !== undefined && (
                <div>
                  <dt className="font-medium text-gray-600">Section Level:</dt>
                  <dd className="text-gray-500">
                    {chunk.metadata.section_level}
                  </dd>
                </div>
              )}
              {chunk.metadata.chunk_index !== undefined && (
                <div>
                  <dt className="font-medium text-gray-600">Chunk Index:</dt>
                  <dd className="text-gray-500">
                    {chunk.metadata.chunk_index}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChunksList({ chunks = [], isLoading }: ChunksListProps) {
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(search);
  }

  const filteredChunks = chunks?.filter((chunk) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    const text = (chunk.text || "").toLowerCase();
    const sectionHeader = (
      chunk.metadata?.section_header || ""
    ).toLowerCase();
    return text.includes(searchLower) || sectionHeader.includes(searchLower);
  });

  const selectedChunk = chunks?.find((c) => c.id === selectedChunkId);

  return (
    <div className="flex gap-4 h-full overflow-hidden">
      {/* Left: Chunks list */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2 p-4 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chunks..."
              className="w-full border rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
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
              onClick={() => {
                setSearch("");
                setSearchQuery("");
              }}
              className="text-sm text-gray-500 px-3 py-1.5 rounded-md border hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </form>

        {/* Chunks list */}
        <div className="overflow-y-auto flex-1 space-y-2 p-4">
          {isLoading && (
            <p className="text-sm text-gray-400">Loading chunks...</p>
          )}

          {!isLoading && filteredChunks.length === 0 && (
            <div className="bg-white border rounded-lg p-8 text-center text-gray-400 text-sm">
              {searchQuery ? `No chunks matching "${searchQuery}"` : "No chunks found"}
            </div>
          )}

          {filteredChunks.map((chunk, index) => (
            <div
              key={chunk.id || index}
              onClick={() => chunk.id && setSelectedChunkId(chunk.id)}
              className="bg-white border rounded-lg p-3 cursor-pointer hover:shadow-md hover:bg-gray-50 transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-500 uppercase">
                  Chunk {chunk.metadata?.chunk_index ?? index + 1}
                </span>
              </div>
              {chunk.metadata?.section_header && (
                <p className="text-xs font-semibold text-gray-700 mb-1">
                  {chunk.metadata.section_header}
                </p>
              )}
              <p className="text-sm text-gray-600 line-clamp-2">
                {(chunk.text || "").substring(0, 150)}...
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Detail panel (conditional) */}
      {selectedChunkId && selectedChunk && (
        <ChunkDetailPanel
          chunk={selectedChunk}
          onClose={() => setSelectedChunkId(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ChunksList.tsx
git commit -m "feat: create ChunksList component with search and detail panel"
```

---

### Task 6: Create ExtractedContentView Component

**Files:**
- Create: `frontend/src/components/ExtractedContentView.tsx`

- [ ] **Step 1: Create ExtractedContentView**

```typescript
interface Chunk {
  id?: string;
  text?: string;
  metadata?: {
    section_header?: string;
    section_level?: number;
    chunk_index?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

interface ExtractedContentViewProps {
  chunks?: Chunk[];
  isLoading?: boolean;
}

export function ExtractedContentView({
  chunks = [],
  isLoading,
}: ExtractedContentViewProps) {
  if (isLoading) {
    return (
      <div className="text-center text-gray-400 text-sm py-8">
        <p>Loading content...</p>
      </div>
    );
  }

  if (!chunks || chunks.length === 0) {
    return (
      <div className="text-center text-gray-400 text-sm py-8">
        <p>No extracted content available</p>
      </div>
    );
  }

  // Group chunks by section header
  const sections: Array<{ header: string; chunks: Chunk[] }> = [];
  let currentSection: string | null = null;
  let currentChunks: Chunk[] = [];

  chunks.forEach((chunk) => {
    const header = chunk.metadata?.section_header || "Content";

    if (header !== currentSection) {
      if (currentSection !== null) {
        sections.push({
          header: currentSection,
          chunks: [...currentChunks],
        });
      }
      currentSection = header;
      currentChunks = [chunk];
    } else {
      currentChunks.push(chunk);
    }
  });

  // Add last section
  if (currentSection !== null) {
    sections.push({
      header: currentSection,
      chunks: currentChunks,
    });
  }

  return (
    <div className="space-y-8 overflow-y-auto p-6 h-full">
      {sections.map((section, idx) => (
        <div key={idx} className="border-l-4 border-slate-300 pl-4 py-2">
          <h3 className="text-base font-bold text-slate-900 mb-4 uppercase tracking-wide">
            {section.header}
          </h3>
          <div className="space-y-4">
            {section.chunks.map((chunk, chunkIdx) => (
              <div
                key={chunk.id || chunkIdx}
                className="bg-gray-50 rounded p-4 hover:bg-gray-100 transition-colors"
              >
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {chunk.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ExtractedContentView.tsx
git commit -m "feat: create ExtractedContentView component for document tab"
```

---

### Task 7: Update Documents.tsx to Use Real Data

**Files:**
- Modify: `frontend/src/pages/Documents.tsx`

- [ ] **Step 1: Replace mock data with real data fetching**

Replace lines 30-111 (mock documents array and related code) with:

```typescript
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface DocumentData {
  id: string;
  name: string;
  file_type?: string;
  file_size?: number;
  processing_status: string;
  created_at: string;
  [key: string]: any;
}

// Helper to generate random score and issues
function getRandomCompliance() {
  const score = Math.floor(Math.random() * 100);
  const issues = Math.floor(Math.random() * 11); // 0-10
  return { score, issues };
}

function getStatusFromScore(score: number) {
  if (score >= 80) return "compliant";
  if (score >= 60) return "warning";
  return "critical";
}
```

- [ ] **Step 2: Update Documents component**

Replace the Documents function body (lines 136-399) with:

```typescript
const Documents = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [chunksModalOpen, setChunksModalOpen] = useState(false);
  const [chunksModalDocId, setChunksModalDocId] = useState<string | null>(null);

  // Get project ID from localStorage or URL (adjust as needed)
  const projectId = localStorage.getItem("projectId") || "default-project";

  const { data: documentsData = [], isLoading } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () =>
      api
        .get(`/projects/${projectId}/documents`)
        .then((r) => r.data)
        .catch(() => []),
  });

  // Map API data to display format with random scores
  const documents = documentsData.map((doc: DocumentData) => {
    const { score, issues } = getRandomCompliance();
    return {
      id: doc.id,
      name: doc.name,
      type: doc.file_type || "Document",
      uploadDate: new Date(doc.created_at).toISOString().split("T")[0],
      status:
        doc.processing_status === "processing"
          ? "processing"
          : getStatusFromScore(score),
      score: doc.processing_status === "completed" ? score : null,
      size: doc.file_size
        ? formatFileSize(doc.file_size)
        : "Unknown",
      issues: doc.processing_status === "completed" ? issues : null,
    };
  });

  function formatFileSize(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
  }

  if (selectedDocument) {
    return (
      <DocumentDetail
        documentId={selectedDocument}
        onBack={() => setSelectedDocument(null)}
      />
    );
  }

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || doc.status === statusFilter;
    const matchesType = typeFilter === "all" || doc.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: keyof typeof statusConfig) => {
    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success font-semibold";
    if (score >= 60) return "text-warning font-semibold";
    return "text-critical font-semibold";
  };

  return (
    <div className="flex-1 space-y-8 p-8 animate-fade-in">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Document Library
        </h1>
        <p className="text-text-secondary mt-2 text-base">
          View, search, and manage your uploaded documents and their compliance status.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card className="card-elevated group hover:shadow-xl transition-shadow duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-600/10 group-hover:bg-accent-600/20 transition-colors">
                <FileText className="h-5 w-5 text-accent-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Total Documents
                </p>
                <p className="text-2xl font-bold mt-1">{documents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated group hover:shadow-xl transition-shadow duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 group-hover:bg-success/20 transition-colors">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Compliant
                </p>
                <p className="text-2xl font-bold text-success mt-1">
                  {documents.filter((d) => d.status === "compliant").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated group hover:shadow-xl transition-shadow duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 group-hover:bg-warning/20 transition-colors">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Need Review
                </p>
                <p className="text-2xl font-bold text-warning mt-1">
                  {documents.filter((d) => d.status === "warning").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated group hover:shadow-xl transition-shadow duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-critical/10 group-hover:bg-critical/20 transition-colors">
                <AlertTriangle className="h-5 w-5 text-critical" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Critical
                </p>
                <p className="text-2xl font-bold text-critical mt-1">
                  {documents.filter((d) => d.status === "critical").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Table Card */}
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-foreground">Documents</CardTitle>
          <CardDescription className="text-text-secondary">
            Search and filter your document library
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="compliant">Compliant</SelectItem>
                <SelectItem value="warning">Needs Review</SelectItem>
                <SelectItem value="critical">Critical Issues</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Contract">Contract</SelectItem>
                <SelectItem value="Policy">Policy</SelectItem>
                <SelectItem value="Agreement">Agreement</SelectItem>
                <SelectItem value="Legal Doc">Legal Doc</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="text-center py-12">
              <p className="text-text-secondary">Loading documents...</p>
            </div>
          )}

          {/* Documents Table */}
          {!isLoading && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Upload Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Compliance Score</TableHead>
                    <TableHead>Issues</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="w-[70px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-accent-600" />
                          <span className="text-foreground">{doc.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{doc.type}</Badge>
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {formatDate(doc.uploadDate)}
                      </TableCell>
                      <TableCell>{getStatusBadge(doc.status)}</TableCell>
                      <TableCell>
                        {doc.score ? (
                          <span className={getScoreColor(doc.score)}>
                            {doc.score}%
                          </span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {doc.issues !== null ? (
                          <span
                            className={
                              doc.issues > 0
                                ? "text-warning font-medium"
                                : "text-success font-medium"
                            }
                          >
                            {doc.issues}
                          </span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {doc.size}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="bg-surface-elevated border-border"
                          >
                            <DropdownMenuItem
                              onClick={() => setSelectedDocument(doc.id)}
                              className="cursor-pointer"
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Analysis
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setChunksModalDocId(doc.id);
                                setChunksModalOpen(true);
                              }}
                              className="cursor-pointer"
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              View Chunks
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer">
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer text-critical hover:bg-critical/10">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredDocuments.length === 0 && (
                <div className="text-center py-12 border-t border-border mt-6">
                  <div className="flex justify-center mb-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface">
                      <FileText className="h-8 w-8 text-text-muted" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No documents found
                  </h3>
                  <p className="text-text-secondary">
                    Try adjusting your search or filter criteria.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Chunks Modal */}
      {chunksModalDocId && (
        <ChunksModal
          open={chunksModalOpen}
          onOpenChange={setChunksModalOpen}
          documentId={chunksModalDocId}
          projectId={projectId}
          documentName={
            documents.find((d) => d.id === chunksModalDocId)?.name || "Document"
          }
        />
      )}
    </div>
  );
};
```

- [ ] **Step 3: Add ChunksModal import**

Add at top of file:
```typescript
import { ChunksModal } from "@/components/ChunksModal";
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Documents.tsx
git commit -m "feat: update Documents page to fetch real data and add ChunksModal integration"
```

---

## Chunk 3: Integration & Testing

### Task 8: Update Dialog Component (If Not Exists)

**Files:**
- Modify or Create: `frontend/src/components/ui/dialog.tsx`

- [ ] **Step 1: Check if Dialog exists**

```bash
ls frontend/src/components/ui/dialog.tsx
```

If file exists, skip to next task. If not:

- [ ] **Step 2: Create Dialog component**

```typescript
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-200 bg-white p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-slate-100 data-[state=open]:text-slate-500">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-slate-500", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
```

- [ ] **Step 3: Commit (if created)**

```bash
git add src/components/ui/dialog.tsx
git commit -m "feat: add Dialog UI component"
```

---

### Task 9: Rebuild and Test

**Files:**
- N/A (Infrastructure)

- [ ] **Step 1: Run database migrations**

```bash
cd c:/Personal/Projects/mizan
docker-compose exec -T backend alembic upgrade head
```

Expected: Migrations applied successfully (or "No new revisions")

- [ ] **Step 2: Rebuild containers**

```bash
docker-compose up -d --build backend frontend
```

Expected: All containers running

- [ ] **Step 3: Verify backend is responsive**

```bash
curl -s http://localhost:8001/health || echo "Backend not ready"
```

- [ ] **Step 4: Commit (if any migrations added)**

```bash
git add backend/alembic/
git commit -m "feat: add database migrations for MizanDocumentChunk"
```

---

## Summary

**Deliverables:**
✅ MizanDocumentChunk model with persistence  
✅ MizanDocument updated with base_document_id FK  
✅ Celery task for Noesia processing (reuses superadmin logic)  
✅ `/documents/{id}/chunks` API endpoint  
✅ ChunksModal, ChunksList, ExtractedContentView components  
✅ Documents.tsx updated with real data + random scores  
✅ Two dropdown actions: "View Analysis" + "View Chunks"  

**Next Steps:**
1. Test upload → processing → chunk viewing workflow
2. Verify chunks are saved in database
3. Verify modal displays correctly with tabs
4. Test with multiple documents

---

Plan complete and saved to `docs/superpowers/plans/2026-04-21-document-upload-pipeline.md`. Ready to execute?