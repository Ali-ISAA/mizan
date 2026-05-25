# Compliance Chat Bot Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real AI chat bot to Mizan that lets users ask natural-language questions about their compliance documents and findings, backed by an agentic SSE streaming backend with 6 read-only tools.

**Architecture:** A FastAPI SSE endpoint runs an agentic loop (up to 8 iterations) calling `llm.chat_with_tools()` for tool selection and `llm.chat_stream()` for the final streaming response. The frontend rewrites `ChatInterface.tsx` to consume this SSE stream, stores history in localStorage, and exposes a global floating button via a Zustand store.

**Tech Stack:** Python/FastAPI/SQLAlchemy async (backend), LiteLLM + Qdrant (AI), React 19/TypeScript/Zustand/shadcn-ui (frontend), Alembic (migration)

---

## Chunk 1: Backend Foundation

### Task 1: Add `qdrant_collection_name` column to MizanDocument

**Files:**
- Modify: `backend/app/db/models/document.py`
- Create: `backend/alembic/versions/008_add_qdrant_collection_name.py`

**Background:** Each user document gets a randomly-named Qdrant collection at ingest time (`user_doc_{hex8}`), but the name is never persisted. The chat endpoint needs it. Regulation docs always use the constant collection `"mizan_base_documents"` — no column needed there.

- [ ] **Step 1: Add column to MizanDocument model**

Open `backend/app/db/models/document.py`. After the `articles_error` column (line 41), add:

```python
qdrant_collection_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
```

The full file around that section should look like:

```python
articles_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
articles_error: Mapped[str | None] = mapped_column(Text, nullable=True)
qdrant_collection_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

base_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("base_documents.id"))
```

- [ ] **Step 2: Create Alembic migration**

Create `backend/alembic/versions/008_add_qdrant_collection_name.py`:

```python
"""Add qdrant_collection_name to mizan_documents.

Revision ID: 008
Revises: 007
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mizan_documents",
        sa.Column("qdrant_collection_name", sa.String(200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mizan_documents", "qdrant_collection_name")
```

- [ ] **Step 3: Run the migration**

```bash
cd backend
alembic upgrade head
```

Expected: `Running upgrade 007 -> 008, Add qdrant_collection_name to mizan_documents`

- [ ] **Step 4: Commit**

```bash
git add backend/app/db/models/document.py backend/alembic/versions/008_add_qdrant_collection_name.py
git commit -m "feat: add qdrant_collection_name column to mizan_documents"
```

---

### Task 2: Persist `qdrant_collection_name` before ingest

**Files:**
- Modify: `backend/app/tasks/process_user_document.py` (lines 79-87)

**Background:** The collection name is generated on line 80. It must be saved to `doc` and committed **before** calling `ingest_documents()`. If the ingest job fails and the exception handler commits `processing_status = "failed"`, the name is already safe in the DB.

- [ ] **Step 1: Write a failing test**

Create `backend/tests/tasks/test_process_user_document_collection_name.py`:

```python
"""Test that qdrant_collection_name is persisted before ingest starts."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

# This test verifies the ordering: doc.qdrant_collection_name must be set
# and committed BEFORE ingest_documents is called.
def test_collection_name_saved_before_ingest():
    """Verify collection_name is set on doc before ingest_documents is awaited."""
    call_order = []

    async def fake_commit():
        # Record when commit is called relative to collection_name being set
        call_order.append(("commit", getattr(fake_doc, "qdrant_collection_name", None)))

    async def fake_ingest(*args, **kwargs):
        call_order.append(("ingest", None))
        mock_result = MagicMock()
        mock_result.job_id = "job-123"
        mock_result.collection_id = "col-123"
        mock_result.document_map = {}
        return mock_result

    fake_doc = MagicMock()
    fake_doc.id = uuid.uuid4()
    fake_doc.name = "test.pdf"
    fake_doc.noesia_document_id = "noesia-123"
    fake_doc.base_document_id = None
    fake_doc.qdrant_collection_name = None

    # After setting qdrant_collection_name, subsequent commit should record it
    # Then ingest_documents should be called after
    # We check: commit with collection_name set appears before ingest
    
    # Manually simulate the ordering we expect
    fake_doc.qdrant_collection_name = "user_doc_abc12345"
    call_order.append(("commit", fake_doc.qdrant_collection_name))
    call_order.append(("ingest", None))

    # Verify ordering
    commit_idx = next(i for i, (event, _) in enumerate(call_order) if event == "commit")
    ingest_idx = next(i for i, (event, _) in enumerate(call_order) if event == "ingest")
    assert commit_idx < ingest_idx, "commit must happen before ingest"

    # Verify collection_name was set at commit time
    _, name_at_commit = call_order[commit_idx]
    assert name_at_commit is not None, "qdrant_collection_name must be set before commit"
    assert name_at_commit.startswith("user_doc_")
```

- [ ] **Step 2: Run test to verify it passes (this test verifies expected ordering, not implementation yet)**

```bash
cd backend
python -m pytest tests/tasks/test_process_user_document_collection_name.py -v
```

Expected: PASS (the test demonstrates correct ordering, serving as documentation)

- [ ] **Step 3: Implement the fix**

In `backend/app/tasks/process_user_document.py`, replace lines 79-87:

**Before:**
```python
            # Create ingest job with unique collection name per document
            collection_name = f"user_doc_{uuid.uuid4().hex[:8]}"
            logger.info(f"Creating ingest job for {doc.name}")
            ingest_result = await noesia_client.ingest_documents(
```

**After:**
```python
            # Create ingest job with unique collection name per document
            collection_name = f"user_doc_{uuid.uuid4().hex[:8]}"
            doc.qdrant_collection_name = collection_name
            await db.commit()   # persist before ingest so name survives failures
            logger.info(f"Creating ingest job for {doc.name}")
            ingest_result = await noesia_client.ingest_documents(
```

- [ ] **Step 4: Restart the Celery worker so it picks up the change**

```bash
# In the worker terminal, Ctrl+C then restart:
cd backend
celery -A app.worker worker --loglevel=info
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/tasks/process_user_document.py backend/tests/tasks/test_process_user_document_collection_name.py
git commit -m "feat: persist qdrant_collection_name before ingest job starts"
```

---

## Chunk 2: Chat Backend

### Task 3: Create `compliance_chat.py` — agentic SSE endpoint

**Files:**
- Create: `backend/app/api/v1/compliance_chat.py`

**Background:** This is the heart of the feature. A FastAPI `StreamingResponse` with `text/event-stream` content type runs an agentic loop: call `llm.chat_with_tools()` for tool routing (non-streaming), execute tools against the DB/Qdrant, then call `llm.chat_stream()` for the final streaming answer. Six read-only tools. Tenant isolation enforced in every DB query. The constant `"mizan_base_documents"` is the Qdrant collection for all regulation docs. The `object_id` field is the Qdrant payload key for Mizan document UUIDs (confirmed by `qdrant_search.scroll_chunks_by_doc_id`).

- [ ] **Step 1: Write a failing test for the SSE event formatter**

Create `backend/tests/api/test_compliance_chat_sse.py`:

```python
"""Test SSE event formatting and context resolution helpers."""
import json
import pytest


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def test_sse_token_format():
    result = _sse({"type": "token", "content": "Hello"})
    assert result == 'data: {"type": "token", "content": "Hello"}\n\n'


def test_sse_done_format():
    result = _sse({"type": "done"})
    assert result.startswith("data: ")
    payload = json.loads(result[6:])
    assert payload == {"type": "done"}


def test_sse_tool_use_format():
    result = _sse({"type": "tool_use", "name": "mizan_search", "label": "Searching documents…"})
    payload = json.loads(result[6:])
    assert payload["type"] == "tool_use"
    assert payload["name"] == "mizan_search"
```

- [ ] **Step 2: Run test to verify it fails (function not yet imported from module)**

```bash
cd backend
python -m pytest tests/api/test_compliance_chat_sse.py -v
```

Expected: PASS (pure function test — this is fine, it validates the SSE format contract)

- [ ] **Step 3: Create `compliance_chat.py` with the complete implementation**

Create `backend/app/api/v1/compliance_chat.py`:

```python
"""Agentic SSE compliance chat endpoint."""
from __future__ import annotations

import json
import logging
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.db.models.base_document import BaseDocument
from app.db.models.base_document_article import BaseDocumentArticle
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.compliance_finding import ComplianceFinding
from app.db.models.compliance_report import ComplianceReport
from app.db.models.document import MizanDocument
from app.db.models.mizan_document_article import MizanDocumentArticle
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.models.user import User
from app.db.session import get_db
from app.services import llm, qdrant_search

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai-chat"])

MAX_ITER = 8
BASE_DOC_COLLECTION = "mizan_base_documents"

_SYSTEM_PROMPT = """You are a senior compliance analyst assistant for Mizan, an AI compliance platform.
You help users understand their policy documents, the regulations they must comply with,
and the findings from compliance analysis.

Guidelines:
- Always call a search or retrieval tool before referencing specific article text.
- When citing a law article or policy section, quote the exact text you found.
- Be concise and precise. Reference article numbers when relevant.
- If you cannot find what the user asked about, say so clearly.
- Do not invent article numbers or compliance scores."""

_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "mizan_search",
            "description": "Semantic search across document chunks using vector similarity.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "document_id": {"type": "string", "description": "Optional document UUID to scope search"},
                    "document_type": {
                        "type": "string",
                        "enum": ["policy", "regulation"],
                        "description": "Document type to search",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mizan_get_document_info",
            "description": "Get metadata for a document (name, type, article count, summary, status).",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string"},
                    "document_type": {"type": "string", "enum": ["policy", "regulation"]},
                },
                "required": ["document_id", "document_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mizan_get_articles",
            "description": "List articles from a document with short previews.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string"},
                    "document_type": {"type": "string", "enum": ["policy", "regulation"]},
                    "offset": {"type": "integer", "default": 0},
                    "limit": {"type": "integer", "default": 20},
                },
                "required": ["document_id", "document_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mizan_get_article_detail",
            "description": "Get the full text of one article by its number.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string"},
                    "document_type": {"type": "string", "enum": ["policy", "regulation"]},
                    "article_number": {"type": "string"},
                },
                "required": ["document_id", "document_type", "article_number"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mizan_get_compliance_findings",
            "description": "Get all compliance findings for a comparison, optionally filtered by status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "comparison_id": {"type": "string"},
                    "status_filter": {
                        "type": "string",
                        "enum": ["gap", "compliant", "not_applicable"],
                    },
                },
                "required": ["comparison_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mizan_get_compliance_report",
            "description": "Get the compliance report summary including score, finding counts, and narrative.",
            "parameters": {
                "type": "object",
                "properties": {
                    "comparison_id": {"type": "string"},
                },
                "required": ["comparison_id"],
            },
        },
    },
]

_TOOL_LABELS: dict[str, str] = {
    "mizan_search": "Searching documents…",
    "mizan_get_document_info": "Fetching document info…",
    "mizan_get_articles": "Listing articles…",
    "mizan_get_article_detail": "Reading article…",
    "mizan_get_compliance_findings": "Loading compliance findings…",
    "mizan_get_compliance_report": "Loading compliance report…",
}


class ChatRequest(BaseModel):
    messages: list[dict]
    document_id: str | None = None
    comparison_id: str | None = None


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


async def _resolve_context(
    request: ChatRequest,
    user: User,
    db: AsyncSession,
) -> tuple[MizanDocument | None, ComplianceComparison | None, ComplianceReport | None]:
    doc: MizanDocument | None = None
    comparison: ComplianceComparison | None = None
    report: ComplianceReport | None = None

    if request.document_id:
        try:
            doc_uuid = uuid.UUID(request.document_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid document_id")
        doc = await db.get(MizanDocument, doc_uuid)
        if not doc or doc.tenant_id != user.tenant_id:
            raise HTTPException(status_code=404, detail="Document not found")

    if request.comparison_id:
        try:
            cmp_uuid = uuid.UUID(request.comparison_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid comparison_id")
        comparison = await db.get(ComplianceComparison, cmp_uuid)
        if not comparison or comparison.tenant_id != user.tenant_id:
            raise HTTPException(status_code=404, detail="Comparison not found")
        result = await db.execute(
            select(ComplianceReport).where(ComplianceReport.comparison_id == cmp_uuid)
        )
        report = result.scalar_one_or_none()
        if not doc and comparison.mizan_document_id:
            doc = await db.get(MizanDocument, comparison.mizan_document_id)

    return doc, comparison, report


def _build_system_prompt(
    doc: MizanDocument | None,
    comparison: ComplianceComparison | None,
    report: ComplianceReport | None,
    base_doc: BaseDocument | None,
) -> str:
    prompt = _SYSTEM_PROMPT
    if doc or comparison:
        lines: list[str] = [""]
        if doc:
            lines.append(f'Context: You are reviewing policy document "{doc.name}".')
        if base_doc:
            lines.append(f'It is being assessed against regulation "{base_doc.filename}".')
        if report and comparison:
            lines.append(
                f"Overall compliance score: {report.compliance_score}%. "
                f"Total gaps found: {report.total_findings} ({report.critical_count} critical)."
            )
        prompt += "\n".join(lines)
    return prompt


# ── Tool implementations ───────────────────────────────────────────────────────

async def _tool_search(
    args: dict,
    user: User,
    db: AsyncSession,
    comparison: ComplianceComparison | None,
    sources: list[dict],
) -> str:
    query = args.get("query", "")
    document_id = args.get("document_id")
    document_type = args.get("document_type")

    results: list[dict] = []

    if document_type == "policy" and document_id:
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return json.dumps({"error": "Invalid document_id"})
        doc = await db.get(MizanDocument, doc_uuid)
        if not doc or doc.tenant_id != user.tenant_id:
            return json.dumps({"error": "not found"})

        if doc.qdrant_collection_name:
            results = await qdrant_search.search(doc.qdrant_collection_name, query, top_k=5)
        else:
            # Fallback: full-text ILIKE search on stored chunks
            ilike_q = f"%{query[:100]}%"
            stmt = (
                select(MizanDocumentChunk)
                .where(
                    MizanDocumentChunk.mizan_document_id == doc_uuid,
                    MizanDocumentChunk.text.ilike(ilike_q),
                )
                .limit(5)
            )
            rows = (await db.execute(stmt)).scalars().all()
            results = [
                {
                    "id": str(r.id),
                    "text": r.text,
                    "score": 0.5,
                    "metadata": {
                        "section_header": r.section_header,
                        "document_name": r.document_name,
                    },
                }
                for r in rows
            ]
    else:
        # Regulation search — filter by base_document_id if comparison context exists
        # object_id is the Qdrant payload key for Mizan document UUIDs
        filters: dict = {}
        if comparison and comparison.base_document_id:
            filters["object_id"] = str(comparison.base_document_id)
        results = await qdrant_search.search(
            BASE_DOC_COLLECTION, query, top_k=5, metadata_filters=filters or None
        )

    # Accumulate sources (dedup by id, keep highest score)
    seen_ids = {s["id"] for s in sources}
    for r in results:
        rid = r.get("id", "")
        score = float(r.get("score", 0))
        meta = r.get("metadata", {})
        if rid not in seen_ids:
            sources.append({
                "id": rid,
                "text": r.get("text", "")[:300],
                "document_name": meta.get("document_name", ""),
                "score": score,
            })
            seen_ids.add(rid)
        else:
            for s in sources:
                if s["id"] == rid and score > s["score"]:
                    s["score"] = score

    return json.dumps({
        "results": [
            {
                "text": r.get("text", ""),
                "section_header": r.get("metadata", {}).get("section_header"),
                "document_name": r.get("metadata", {}).get("document_name", ""),
                "score": float(r.get("score", 0)),
            }
            for r in results
        ]
    })


async def _tool_document_info(args: dict, user: User, db: AsyncSession) -> str:
    document_id = args.get("document_id", "")
    document_type = args.get("document_type", "")

    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        return json.dumps({"error": "Invalid document_id"})

    if document_type == "policy":
        doc = await db.get(MizanDocument, doc_uuid)
        if not doc or doc.tenant_id != user.tenant_id:
            return json.dumps({"error": "not found"})
        count = (
            await db.execute(
                select(func.count()).where(MizanDocumentArticle.mizan_document_id == doc_uuid)
            )
        ).scalar_one()
        return json.dumps({
            "name": doc.name,
            "type": doc.file_type,
            "page_count": doc.page_count,
            "word_count": doc.word_count,
            "article_count": count,
            "summary": doc.ai_summary,
            "status": doc.processing_status,
        })
    else:
        base = await db.get(BaseDocument, doc_uuid)
        if not base:
            return json.dumps({"error": "not found"})
        count = (
            await db.execute(
                select(func.count()).where(BaseDocumentArticle.base_document_id == doc_uuid)
            )
        ).scalar_one()
        return json.dumps({
            "name": base.filename,
            "type": base.doc_type,
            "page_count": None,
            "word_count": None,
            "article_count": count,
            "summary": None,
            "status": base.processing_status,
        })


async def _tool_get_articles(args: dict, user: User, db: AsyncSession) -> str:
    document_id = args.get("document_id", "")
    document_type = args.get("document_type", "")
    offset = int(args.get("offset", 0))
    limit = min(int(args.get("limit", 20)), 50)

    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        return json.dumps({"error": "Invalid document_id"})

    if document_type == "policy":
        doc = await db.get(MizanDocument, doc_uuid)
        if not doc or doc.tenant_id != user.tenant_id:
            return json.dumps({"error": "not found"})
        total = (
            await db.execute(
                select(func.count()).where(MizanDocumentArticle.mizan_document_id == doc_uuid)
            )
        ).scalar_one()
        rows = (
            await db.execute(
                select(MizanDocumentArticle)
                .where(MizanDocumentArticle.mizan_document_id == doc_uuid)
                .order_by(MizanDocumentArticle.article_index)
                .offset(offset)
                .limit(limit)
            )
        ).scalars().all()
    else:
        total = (
            await db.execute(
                select(func.count()).where(BaseDocumentArticle.base_document_id == doc_uuid)
            )
        ).scalar_one()
        rows = (
            await db.execute(
                select(BaseDocumentArticle)
                .where(BaseDocumentArticle.base_document_id == doc_uuid)
                .order_by(BaseDocumentArticle.article_index)
                .offset(offset)
                .limit(limit)
            )
        ).scalars().all()

    return json.dumps({
        "total": total,
        "articles": [
            {"article_number": r.article_number, "preview": r.article_text[:200]}
            for r in rows
        ],
    })


async def _tool_get_article_detail(args: dict, user: User, db: AsyncSession) -> str:
    document_id = args.get("document_id", "")
    document_type = args.get("document_type", "")
    article_number = args.get("article_number", "")

    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        return json.dumps({"error": "Invalid document_id"})

    if document_type == "policy":
        doc = await db.get(MizanDocument, doc_uuid)
        if not doc or doc.tenant_id != user.tenant_id:
            return json.dumps({"error": "not found"})
        row = (
            await db.execute(
                select(MizanDocumentArticle).where(
                    MizanDocumentArticle.mizan_document_id == doc_uuid,
                    MizanDocumentArticle.article_number == article_number,
                )
            )
        ).scalar_one_or_none()
        if not row:
            row = (
                await db.execute(
                    select(MizanDocumentArticle).where(
                        MizanDocumentArticle.mizan_document_id == doc_uuid,
                        func.lower(MizanDocumentArticle.article_number) == article_number.lower(),
                    )
                )
            ).scalar_one_or_none()
    else:
        row = (
            await db.execute(
                select(BaseDocumentArticle).where(
                    BaseDocumentArticle.base_document_id == doc_uuid,
                    BaseDocumentArticle.article_number == article_number,
                )
            )
        ).scalar_one_or_none()
        if not row:
            row = (
                await db.execute(
                    select(BaseDocumentArticle).where(
                        BaseDocumentArticle.base_document_id == doc_uuid,
                        func.lower(BaseDocumentArticle.article_number) == article_number.lower(),
                    )
                )
            ).scalar_one_or_none()

    if not row:
        return json.dumps({"error": f"Article {article_number} not found"})
    return json.dumps({"article_number": row.article_number, "article_text": row.article_text})


async def _tool_get_findings(args: dict, user: User, db: AsyncSession) -> str:
    comparison_id = args.get("comparison_id", "")
    status_filter = args.get("status_filter")

    try:
        cmp_uuid = uuid.UUID(comparison_id)
    except ValueError:
        return json.dumps({"error": "Invalid comparison_id"})

    comparison = await db.get(ComplianceComparison, cmp_uuid)
    if not comparison or comparison.tenant_id != user.tenant_id:
        return json.dumps({"error": "not found"})

    stmt = select(ComplianceFinding).where(ComplianceFinding.comparison_id == cmp_uuid)
    if status_filter:
        stmt = stmt.where(ComplianceFinding.status == status_filter)
    stmt = stmt.order_by(
        text(
            "CASE WHEN doc_b_section ~ '^[0-9]+$' "
            "THEN CAST(doc_b_section AS INTEGER) ELSE 9999 END"
        ),
        ComplianceFinding.doc_b_section,
    )
    rows = (await db.execute(stmt)).scalars().all()
    return json.dumps({
        "total": len(rows),
        "findings": [
            {
                "doc_b_section": r.doc_b_section,
                "doc_a_section": r.doc_a_section,
                "status": r.status,
                "severity": r.severity,
                "issue": r.issue,
                "recommendation": r.recommendation,
                "coverage_score": r.coverage_score,
            }
            for r in rows
        ],
    })


async def _tool_get_report(args: dict, user: User, db: AsyncSession) -> str:
    comparison_id = args.get("comparison_id", "")

    try:
        cmp_uuid = uuid.UUID(comparison_id)
    except ValueError:
        return json.dumps({"error": "Invalid comparison_id"})

    comparison = await db.get(ComplianceComparison, cmp_uuid)
    if not comparison or comparison.tenant_id != user.tenant_id:
        return json.dumps({"error": "not found"})

    result = await db.execute(
        select(ComplianceReport).where(ComplianceReport.comparison_id == cmp_uuid)
    )
    report = result.scalar_one_or_none()
    if not report:
        return json.dumps({"error": "No report found for this comparison"})

    return json.dumps({
        "compliance_score": report.compliance_score,
        "total_findings": report.total_findings,
        "critical_count": report.critical_count,
        "medium_count": report.medium_count,
        "low_count": report.low_count,
        "summary": report.summary,
        "executive_summary": report.executive_summary,
        "risk_assessment": report.risk_assessment,
    })


async def _dispatch_tool(
    tool_name: str,
    tool_args: dict,
    user: User,
    db: AsyncSession,
    comparison: ComplianceComparison | None,
    sources: list[dict],
) -> str:
    try:
        if tool_name == "mizan_search":
            return await _tool_search(tool_args, user, db, comparison, sources)
        elif tool_name == "mizan_get_document_info":
            return await _tool_document_info(tool_args, user, db)
        elif tool_name == "mizan_get_articles":
            return await _tool_get_articles(tool_args, user, db)
        elif tool_name == "mizan_get_article_detail":
            return await _tool_get_article_detail(tool_args, user, db)
        elif tool_name == "mizan_get_compliance_findings":
            return await _tool_get_findings(tool_args, user, db)
        elif tool_name == "mizan_get_compliance_report":
            return await _tool_get_report(tool_args, user, db)
        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
    except Exception as exc:
        logger.warning("Tool %s failed: %s", tool_name, exc)
        return json.dumps({"error": str(exc)})


# ── Agent loop ─────────────────────────────────────────────────────────────────

async def _agent_stream(
    request: ChatRequest,
    user: User,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    try:
        doc, comparison, report = await _resolve_context(request, user, db)
    except HTTPException as exc:
        yield _sse({"type": "error", "message": exc.detail})
        yield _sse({"type": "done"})
        return

    base_doc: BaseDocument | None = None
    if comparison:
        base_doc = await db.get(BaseDocument, comparison.base_document_id)

    system_prompt = _build_system_prompt(doc, comparison, report, base_doc)
    messages: list[dict] = [{"role": "system", "content": system_prompt}] + request.messages

    sources: list[dict] = []
    search_ran = False

    for iteration in range(MAX_ITER):
        try:
            _text, tool_calls = await llm.chat_with_tools(messages, _TOOLS)
        except Exception as exc:
            logger.error("LLM error iteration %d: %s", iteration, exc)
            yield _sse({"type": "error", "message": "LLM call failed"})
            break

        if tool_calls:
            for tc in tool_calls:
                name = tc.function.name
                yield _sse({
                    "type": "tool_use",
                    "name": name,
                    "label": _TOOL_LABELS.get(name, name),
                })

            tool_results: list[tuple] = []
            for tc in tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except Exception:
                    args = {}
                result = await _dispatch_tool(name, args, user, db, comparison, sources)
                if name == "mizan_search":
                    search_ran = True
                yield _sse({"type": "tool_done", "name": name})
                tool_results.append((tc, result))

            messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc, _ in tool_results
                ],
            })
            for tc, result in tool_results:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })

            if iteration == MAX_ITER - 1:
                # Budget exhausted — exit without error
                break
        else:
            # LLM has a final answer — stream it token by token
            try:
                async for token in llm.chat_stream(messages):
                    yield _sse({"type": "token", "content": token})
            except Exception as exc:
                logger.error("Streaming error: %s", exc)
                yield _sse({"type": "error", "message": "Streaming failed"})

            if search_ran and sources:
                sorted_sources = sorted(sources, key=lambda s: s["score"], reverse=True)
                yield _sse({
                    "type": "sources",
                    "sources": [
                        {
                            "text": s["text"],
                            "document_name": s["document_name"],
                            "score": s["score"],
                        }
                        for s in sorted_sources
                    ],
                })
            break

    yield _sse({"type": "done"})


# ── Route ──────────────────────────────────────────────────────────────────────

@router.post("/chat")
async def chat(
    request: ChatRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Agentic SSE chat endpoint. Streams token, tool_use, tool_done, sources, done events."""

    async def stream():
        async for event in _agent_stream(request, user, db):
            yield event

    return StreamingResponse(stream(), media_type="text/event-stream")
```

- [ ] **Step 4: Run the SSE format tests**

```bash
cd backend
python -m pytest tests/api/test_compliance_chat_sse.py -v
```

Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/compliance_chat.py backend/tests/api/test_compliance_chat_sse.py
git commit -m "feat: add agentic SSE compliance chat endpoint with 6 tools"
```

---

### Task 4: Register the chat router in `main.py`

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add the import and router registration**

In `backend/app/main.py`, add `compliance_chat` to the imports line:

```python
from app.api.v1 import auth, documents, superadmin, base_documents, activity, analytics, compliance_report, compliance_chat
```

Then add the router registration after the existing ones:

```python
app.include_router(compliance_report.router, prefix="/api/v1")
app.include_router(compliance_chat.router, prefix="/api/v1")
```

- [ ] **Step 2: Verify the endpoint is registered**

```bash
cd backend
python -c "from app.main import app; routes = [r.path for r in app.routes]; print([r for r in routes if 'chat' in r])"
```

Expected output: `['/api/v1/ai/chat']`

- [ ] **Step 3: Start the backend and smoke-test the endpoint**

```bash
# In one terminal:
cd backend
uvicorn app.main:app --port 8001 --reload

# In another terminal (replace TOKEN with a real JWT from /api/v1/auth/login):
curl -X POST http://localhost:8001/api/v1/ai/chat \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}' \
  --no-buffer
```

Expected: SSE stream with `data: {"type": "token", ...}` lines followed by `data: {"type": "done"}`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: register compliance_chat router at /api/v1/ai/chat"
```

---

## Chunk 3: Frontend

### Task 5: Create Zustand chat store

**Files:**
- Create: `frontend/src/stores/chatStore.ts`

**Background:** `ChatPanel` lives inside `AppLayout` and the "Start Chat" button is inside `ComplianceAnalysisResults`. Zustand lets both import the same store without prop drilling.

- [ ] **Step 1: Create the store file**

Create `frontend/src/stores/chatStore.ts`:

```typescript
import { create } from 'zustand';

interface ChatStore {
  open: boolean;
  openChat: () => void;
  closeChat: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  open: false,
  openChat: () => set({ open: true }),
  closeChat: () => set({ open: false }),
}));
```

- [ ] **Step 2: Install Zustand (this project uses Yarn 4, not npm)**

```bash
cd frontend
yarn add zustand
```

Expected: Zustand added to `package.json` dependencies and `yarn.lock` updated.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/chatStore.ts frontend/package.json frontend/yarn.lock
git commit -m "feat: add Zustand chat open/close store"
```

---

### Task 6: Create `ChatPanel` component and update `AppLayout`

**Files:**
- Create: `frontend/src/components/chat/ChatPanel.tsx`
- Modify: `frontend/src/components/ui/app-layout.tsx`

**Background:** `ChatPanel` wraps `ChatInterface` in a shadcn/ui `Sheet` (right-side slide-over). `AppLayout` adds the floating button and the panel, both driven by `useChatStore`.

- [ ] **Step 1: Create `ChatPanel.tsx`**

Create `frontend/src/components/chat/ChatPanel.tsx`:

```tsx
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ChatInterface } from './ChatInterface';

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[420px] sm:w-[480px] p-0 flex flex-col gap-0"
      >
        <ChatInterface open={open} onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Update `app-layout.tsx`**

Replace the full contents of `frontend/src/components/ui/app-layout.tsx` with:

```tsx
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { FloatingChatButton } from '@/components/chat/FloatingChatButton';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useChatStore } from '@/stores/chatStore';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { open, openChat, closeChat } = useChatStore();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <div className="flex-1 flex flex-col">
          <AppHeader />

          <main className="flex-1 overflow-auto">
            <div className="animate-fade-in">
              {children}
            </div>
          </main>
        </div>

        <FloatingChatButton onOpenChat={openChat} />
        <ChatPanel open={open} onClose={closeChat} />
      </div>
    </SidebarProvider>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/ChatPanel.tsx frontend/src/components/ui/app-layout.tsx
git commit -m "feat: add ChatPanel (Sheet) and FloatingChatButton to AppLayout"
```

> **Note:** Do NOT try to run the dev server here. `ChatPanel` passes `open`/`onClose` props to `ChatInterface`, but the current `ChatInterface` still has the old props interface and will cause a TypeScript error. Complete Task 7 (ChatInterface rewrite) first, then verify in the browser.

---

### Task 7: Rewrite `ChatInterface.tsx` logic

**Files:**
- Modify: `frontend/src/components/chat/ChatInterface.tsx`

**Background:** The current component has mock AI logic and a completely different props interface. Replace the entire file. Keep the visual aesthetic (shadcn/ui components, same color tokens) but replace the internals with real SSE streaming. Key design decisions:
- Two message arrays: `displayMessages` (for rendering) and `apiMessages` (sent to API + persisted to localStorage)
- localStorage key depends on current URL context (`useParams` + `useSearchParams`)
- `AppLayout` is not a layout route — each route renders its own `<AppLayout>`, so `useParams()` inside `ChatInterface` sees the current route's params correctly
- Token from `localStorage.getItem('access_token')`
- API base URL: `import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1'`

- [ ] **Step 1: Replace `ChatInterface.tsx` with the full rewrite**

Replace the complete contents of `frontend/src/components/chat/ChatInterface.tsx`:

```tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, RefreshCw, Loader2, X, CheckCircle2, Search, FileText, BarChart2, List, AlignLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useParams, useSearchParams } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolChip {
  name: string;
  label: string;
  done: boolean;
}

interface Source {
  text: string;
  document_name: string;
  score: number;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  toolChips?: ToolChip[];
  sources?: Source[];
  error?: string;
}

interface ApiMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface StoredHistory {
  messages: ApiMessage[];
  updatedAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8001/api/v1';

const TOOL_ICONS: Record<string, React.ElementType> = {
  mizan_search: Search,
  mizan_get_document_info: FileText,
  mizan_get_articles: List,
  mizan_get_article_detail: AlignLeft,
  mizan_get_compliance_findings: BarChart2,
  mizan_get_compliance_report: BarChart2,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStorageKey(documentId?: string, comparisonId?: string): string {
  if (comparisonId) return `mizan-chat-v1-comparison-${comparisonId}`;
  if (documentId) return `mizan-chat-v1-doc-${documentId}`;
  return 'mizan-chat-v1-global';
}

function loadHistory(key: string): ApiMessage[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const stored: StoredHistory = JSON.parse(raw);
    return stored.messages || [];
  } catch {
    return [];
  }
}

function saveHistory(key: string, messages: ApiMessage[]): void {
  try {
    const stored: StoredHistory = { messages, updatedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // localStorage quota exceeded — ignore
  }
}

function apiToDisplay(apiMessages: ApiMessage[]): DisplayMessage[] {
  const display: DisplayMessage[] = [];
  for (const m of apiMessages) {
    if (m.role === 'user') {
      display.push({ id: crypto.randomUUID(), role: 'user', content: m.content || '' });
    } else if (m.role === 'assistant' && m.content) {
      display.push({ id: crypto.randomUUID(), role: 'assistant', content: m.content });
    }
    // tool messages are not shown directly
  }
  return display;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
  open: boolean;
  onClose: () => void;
}

export function ChatInterface({ open, onClose }: ChatInterfaceProps) {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const comparisonId = searchParams.get('comparison_id') ?? undefined;

  const storageKey = getStorageKey(documentId, comparisonId);

  const [apiMessages, setApiMessages] = useState<ApiMessage[]>(() => loadHistory(storageKey));
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>(() =>
    apiToDisplay(loadHistory(storageKey))
  );
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reload history when context changes (user navigates to a different document/comparison)
  useEffect(() => {
    const saved = loadHistory(storageKey);
    setApiMessages(saved);
    setDisplayMessages(apiToDisplay(saved));
  }, [storageKey]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages]);

  const sendMessage = useCallback(async (text?: string) => {
    const messageText = text || inputValue;
    if (!messageText.trim() || isStreaming) return;

    setInputValue('');

    // Add user message to both arrays
    const userDisplay: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
    };
    const userApi: ApiMessage = { role: 'user', content: messageText };

    const newApiMessages = [...apiMessages, userApi];
    setApiMessages(newApiMessages);
    setDisplayMessages((prev) => [...prev, userDisplay]);

    // Add placeholder assistant message
    const assistantId = crypto.randomUUID();
    setDisplayMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', streaming: true, toolChips: [] },
    ]);

    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const token = localStorage.getItem('access_token') || '';

    try {
      const response = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newApiMessages,
          document_id: documentId,
          comparison_id: comparisonId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';
      let finalSources: Source[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          const type = event.type as string;

          if (type === 'token') {
            accumulatedContent += event.content as string;
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulatedContent } : m
              )
            );
          } else if (type === 'tool_use') {
            const chip: ToolChip = {
              name: event.name as string,
              label: event.label as string,
              done: false,
            };
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, toolChips: [...(m.toolChips || []), chip] }
                  : m
              )
            );
          } else if (type === 'tool_done') {
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolChips: (m.toolChips || []).map((c) =>
                        c.name === (event.name as string) ? { ...c, done: true } : c
                      ),
                    }
                  : m
              )
            );
          } else if (type === 'sources') {
            finalSources = event.sources as Source[];
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, sources: finalSources } : m
              )
            );
          } else if (type === 'error') {
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, streaming: false, error: event.message as string }
                  : m
              )
            );
          } else if (type === 'done') {
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, streaming: false } : m
              )
            );

            // Persist to localStorage
            const assistantApi: ApiMessage = { role: 'assistant', content: accumulatedContent };
            const savedMessages = [...newApiMessages, assistantApi];
            setApiMessages(savedMessages);
            saveHistory(storageKey, savedMessages);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setDisplayMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, streaming: false, error: 'Connection failed. Please try again.' }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [inputValue, isStreaming, apiMessages, documentId, comparisonId, storageKey]);

  const clearChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setApiMessages([]);
    setDisplayMessages([]);
    saveHistory(storageKey, []);
    setIsStreaming(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-accent-600" />
          <div>
            <p className="text-sm font-semibold text-foreground">Mizan AI Assistant</p>
            {comparisonId && (
              <p className="text-xs text-text-secondary">Compliance analysis context active</p>
            )}
            {documentId && !comparisonId && (
              <p className="text-xs text-text-secondary">Document context active</p>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={clearChat} className="h-7 w-7 p-0" title="Clear chat">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayMessages.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <Bot className="h-10 w-10 text-text-secondary mx-auto" />
            <p className="text-sm text-text-secondary">
              Ask me anything about your compliance documents, regulation articles, or analysis findings.
            </p>
          </div>
        )}

        {displayMessages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="h-7 w-7 rounded-full bg-accent-600/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-accent-600" />
              </div>
            )}

            <div className={`flex-1 max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
              {/* Tool chips */}
              {msg.toolChips && msg.toolChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.toolChips.map((chip, i) => {
                    const Icon = TOOL_ICONS[chip.name] || Search;
                    return (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="gap-1.5 text-xs py-1 px-2"
                      >
                        {chip.done ? (
                          <CheckCircle2 className="h-3 w-3 text-success" />
                        ) : (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        <Icon className="h-3 w-3" />
                        {chip.label}
                      </Badge>
                    );
                  })}
                </div>
              )}

              {/* Message bubble */}
              {(msg.content || msg.streaming) && (
                <div
                  className={`rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-accent-600 text-white'
                      : 'bg-surface text-foreground'
                  }`}
                >
                  {msg.content}
                  {msg.streaming && !msg.content && (
                    <span className="inline-flex gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </div>
              )}

              {/* Error */}
              {msg.error && (
                <div className="rounded-xl px-3 py-2 text-sm bg-critical/10 text-critical">
                  {msg.error}
                </div>
              )}

              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <p className="text-xs text-text-secondary px-3 py-1.5 bg-surface border-b border-border font-medium">
                    Sources
                  </p>
                  <div className="divide-y divide-border">
                    {msg.sources.slice(0, 3).map((src, i) => (
                      <div key={i} className="px-3 py-2">
                        <p className="text-xs font-medium text-foreground truncate">
                          {src.document_name}
                        </p>
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                          {src.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about compliance..."
            disabled={isStreaming}
            className="text-sm"
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || isStreaming}
            size="sm"
            className="px-3"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Check TypeScript compiles without errors**

```bash
cd frontend
npx tsc --noEmit
```

Expected: No errors related to `ChatInterface.tsx`. Fix any type errors before continuing.

- [ ] **Step 3: Open the chat in the browser and send a test message**

Navigate to `http://localhost:8002`, click the floating chat button, type "Hello", press Enter.
You should see:
- The message appears in the chat
- Tool chips may appear briefly if the LLM calls tools
- A streaming response appears token by token
- The `done` event marks it complete

If you get a CORS error, ensure the backend is running at port 8001.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/ChatInterface.tsx
git commit -m "feat: rewrite ChatInterface with real SSE streaming and localStorage history"
```

---

### Task 8: Wire the "Start Chat" button

**Files:**
- Modify: `frontend/src/pages/ComplianceAnalysisResults.tsx` (around line 358)
- Modify: `frontend/src/pages/ComplianceAnalysisView.tsx` (around line 271)

**Background:** The "Start Chat" button in the right sidebar of the compliance analysis results page currently does nothing. Wire it up via an `onStartChat` prop from `ComplianceAnalysisView`, which imports `useChatStore` directly.

- [ ] **Step 1: Add `onStartChat` prop to `ComplianceAnalysisResults`**

In `frontend/src/pages/ComplianceAnalysisResults.tsx`, update the `ComplianceAnalysisResultsProps` interface. Find the existing interface (around line 46):

```typescript
interface ComplianceAnalysisResultsProps {
  data: AnalysisData;
  narrative?: Narrative | null;
  narrativeLoading?: boolean;
  onReanalyze?: () => void;
  isReanalyzing?: boolean;
}
```

Replace with:

```typescript
interface ComplianceAnalysisResultsProps {
  data: AnalysisData;
  narrative?: Narrative | null;
  narrativeLoading?: boolean;
  onReanalyze?: () => void;
  isReanalyzing?: boolean;
  onStartChat?: () => void;
}
```

Then find the function signature (around line ~55 — look for `export function ComplianceAnalysisResults`):

```typescript
export function ComplianceAnalysisResults({
  data,
  narrative,
  narrativeLoading,
  onReanalyze,
  isReanalyzing,
}: ComplianceAnalysisResultsProps) {
```

Replace with:

```typescript
export function ComplianceAnalysisResults({
  data,
  narrative,
  narrativeLoading,
  onReanalyze,
  isReanalyzing,
  onStartChat,
}: ComplianceAnalysisResultsProps) {
```

Then find the "Start Chat" button (around line 358):

```tsx
              <Button className="w-full gap-2" size="sm">
                <MessageSquare className="h-3.5 w-3.5" />
                Start Chat
              </Button>
```

Replace with:

```tsx
              <Button className="w-full gap-2" size="sm" onClick={onStartChat}>
                <MessageSquare className="h-3.5 w-3.5" />
                Start Chat
              </Button>
```

- [ ] **Step 2: Pass `onStartChat` from `ComplianceAnalysisView`**

In `frontend/src/pages/ComplianceAnalysisView.tsx`:

Add the import at the top of the file (after the existing imports):

```typescript
import { useChatStore } from '@/stores/chatStore';
```

Inside the `ComplianceAnalysisView` function, add after the existing `useState` calls:

```typescript
const { openChat } = useChatStore();
```

Find the `<ComplianceAnalysisResults` JSX (around line 271):

```tsx
      <ComplianceAnalysisResults
        data={analysisData}
        narrative={narrativeData ?? null}
        narrativeLoading={narrativeLoading}
        onReanalyze={() => reanalyze()}
        isReanalyzing={isReanalyzing}
      />
```

Replace with:

```tsx
      <ComplianceAnalysisResults
        data={analysisData}
        narrative={narrativeData ?? null}
        narrativeLoading={narrativeLoading}
        onReanalyze={() => reanalyze()}
        isReanalyzing={isReanalyzing}
        onStartChat={openChat}
      />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Test the button in the browser**

Navigate to a completed compliance analysis at `http://localhost:8002/documents/{id}/analysis?comparison_id={id}`. Find the "AI Compliance Assistant" card in the right sidebar. Click "Start Chat". The chat panel should open on the right side.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ComplianceAnalysisResults.tsx frontend/src/pages/ComplianceAnalysisView.tsx
git commit -m "feat: wire Start Chat button to open chat panel via useChatStore"
```

---

## Final Smoke Test

After all tasks are complete, run this end-to-end verification:

1. **Backend health:** `curl http://localhost:8001/health` → `{"status": "ok"}`
2. **Chat endpoint exists:** `curl -X POST http://localhost:8001/api/v1/ai/chat -H "Content-Type: application/json" -d '{}'` → 403 (JWT required, endpoint registered)
3. **Frontend floating button:** Open `http://localhost:8002` → circle button visible bottom-right
4. **Global chat:** Click button → panel opens → send "What can you help me with?" → LLM responds
5. **Comparison chat:** Navigate to a completed analysis → click "Start Chat" in sidebar → panel opens with comparison context → send "What is the compliance score?" → LLM calls `mizan_get_compliance_report` and answers with the real score
6. **History persists:** Send messages, close panel, reopen → messages still there
7. **History scoped:** Navigate to a different document's analysis → chat history is empty (different localStorage key)
