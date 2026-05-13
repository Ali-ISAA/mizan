# Article Extraction — Superadmin Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LLM-based article extraction to the superadmin: DB tables, Celery task, API endpoints, and an "Articles" tab in the DocumentDetail page.

**Architecture:** A new Celery task reads chunks from the DB, batches them, calls the LLM for structured article extraction, deduplicates, and stores results in two new tables. The superadmin UI gains an Articles tab that polls the same document endpoint (with two new fields) and lets superadmins trigger/re-trigger extraction.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2 async (mapped_column), Alembic, Celery + Redis, LiteLLM (dashscope), React 19, TypeScript, Tailwind, React Query

**Spec:** `docs/superpowers/specs/2026-05-13-article-extraction-design.md`

---

## File Map

**Created:**
- `backend/alembic/versions/006_add_article_extraction_tables.py` — migration
- `backend/app/db/models/base_document_article.py` — BaseDocumentArticle model
- `backend/app/db/models/mizan_document_article.py` — MizanDocumentArticle model
- `backend/app/tasks/extract_articles.py` — `extract_articles_task` Celery task
- `backend/tests/test_article_extraction.py` — unit tests

**Modified:**
- `backend/app/db/models/base_document.py` — add `articles_status`, `articles_error` columns
- `backend/app/db/models/document.py` — add `articles_status`, `articles_error` columns
- `backend/app/db/models/__init__.py` — import new models
- `backend/app/worker.py` — add `app.tasks.extract_articles` to include list
- `backend/app/api/v1/base_documents.py` — extend `BaseDocOut`, add articles endpoints
- `backend/app/tasks/process_base_document.py` — auto-trigger extraction after completion
- `backend/app/services/compliance_comparator.py` — add `compare_article` + `_build_article_prompt` + `_parse_article_response`
- `superadmin/src/pages/DocumentDetail.tsx` — Articles tab + polling fix

---

## Chunk 1: Foundation — Migration, Models, Celery Task

### Task 1: DB Migration (revision 006)

**Files:**
- Create: `backend/alembic/versions/006_add_article_extraction_tables.py`

**Background:** The project uses Alembic for DB migrations. Existing revisions live in `backend/alembic/versions/`. The chain ends at `005`. Each revision file has `upgrade()` and `downgrade()` functions. Run migrations inside the `backend` container.

- [ ] **Step 1: Create the migration file**

Create `backend/alembic/versions/006_add_article_extraction_tables.py` with this exact content:

```python
"""Add article extraction tables and status columns.

Revision ID: 006
Revises: 005
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add articles_status and articles_error to base_documents
    op.add_column("base_documents", sa.Column("articles_status", sa.String(20), nullable=True))
    op.add_column("base_documents", sa.Column("articles_error", sa.Text(), nullable=True))

    # Add articles_status and articles_error to mizan_documents
    op.add_column("mizan_documents", sa.Column("articles_status", sa.String(20), nullable=True))
    op.add_column("mizan_documents", sa.Column("articles_error", sa.Text(), nullable=True))

    # Create base_document_articles
    op.create_table(
        "base_document_articles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("base_document_id", UUID(as_uuid=True), sa.ForeignKey("base_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("article_index", sa.Integer(), nullable=False),
        sa.Column("article_number", sa.String(50), nullable=False),
        sa.Column("article_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_base_doc_articles_doc_index", "base_document_articles", ["base_document_id", "article_index"])

    # Create mizan_document_articles
    op.create_table(
        "mizan_document_articles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("mizan_document_id", UUID(as_uuid=True), sa.ForeignKey("mizan_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("article_index", sa.Integer(), nullable=False),
        sa.Column("article_number", sa.String(50), nullable=False),
        sa.Column("article_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_mizan_doc_articles_doc_index", "mizan_document_articles", ["mizan_document_id", "article_index"])


def downgrade() -> None:
    op.drop_table("mizan_document_articles")
    op.drop_table("base_document_articles")
    op.drop_column("mizan_documents", "articles_error")
    op.drop_column("mizan_documents", "articles_status")
    op.drop_column("base_documents", "articles_error")
    op.drop_column("base_documents", "articles_status")
```

- [ ] **Step 2: Run the migration inside the backend container**

```bash
docker exec mizan-backend-1 alembic -c /app/alembic.ini upgrade head
```

Expected output ends with: `Running upgrade 005 -> 006, Add article extraction tables and status columns`

- [ ] **Step 3: Verify tables and columns exist**

```bash
docker exec mizan-db-1 psql -U mizan -d mizan -c "\d base_document_articles"
docker exec mizan-db-1 psql -U mizan -d mizan -c "\d mizan_document_articles"
docker exec mizan-db-1 psql -U mizan -d mizan -c "\d base_documents" | grep articles
```

Expected: both tables exist with 6 columns each; `base_documents` shows `articles_status` and `articles_error` columns.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/006_add_article_extraction_tables.py
git commit -m "feat: migration 006 — add article extraction tables and status columns"
```

---

### Task 2: SQLAlchemy Models

**Files:**
- Create: `backend/app/db/models/base_document_article.py`
- Create: `backend/app/db/models/mizan_document_article.py`
- Modify: `backend/app/db/models/base_document.py` (add 2 columns)
- Modify: `backend/app/db/models/document.py` (add 2 columns)
- Modify: `backend/app/db/models/__init__.py` (import new models)

**Background:** Models use SQLAlchemy 2 mapped_column style. Look at `base_document_chunk.py` for the FK + relationship pattern. All models must be imported in `__init__.py` or Alembic and ORM queries won't see them.

- [ ] **Step 1: Write failing model instantiation test**

Add to `backend/tests/test_article_extraction.py`:

```python
from app.db.models.base_document_article import BaseDocumentArticle
from app.db.models.mizan_document_article import MizanDocumentArticle
import uuid


def test_base_document_article_instantiation():
    article = BaseDocumentArticle(
        base_document_id=uuid.uuid4(),
        article_index=0,
        article_number="1",
        article_text="Full text of article 1.",
    )
    assert article.article_number == "1"
    assert article.article_index == 0


def test_mizan_document_article_instantiation():
    article = MizanDocumentArticle(
        mizan_document_id=uuid.uuid4(),
        article_index=0,
        article_number="2.1",
        article_text="Full text of article 2.1.",
    )
    assert article.article_number == "2.1"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker exec mizan-backend-1 python -m pytest tests/test_article_extraction.py -v
```

Expected: `ImportError` — `base_document_article` module does not exist.

- [ ] **Step 3: Create `base_document_article.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BaseDocumentArticle(Base):
    __tablename__ = "base_document_articles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    base_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("base_documents.id", ondelete="CASCADE"), nullable=False
    )
    article_index: Mapped[int] = mapped_column(Integer, nullable=False)
    article_number: Mapped[str] = mapped_column(String(50), nullable=False)
    article_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

- [ ] **Step 4: Create `mizan_document_article.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MizanDocumentArticle(Base):
    __tablename__ = "mizan_document_articles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mizan_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mizan_documents.id", ondelete="CASCADE"), nullable=False
    )
    article_index: Mapped[int] = mapped_column(Integer, nullable=False)
    article_number: Mapped[str] = mapped_column(String(50), nullable=False)
    article_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

- [ ] **Step 5: Add `articles_status` and `articles_error` to `BaseDocument`**

In `backend/app/db/models/base_document.py`, add two lines after the `updated_at` column:

```python
    articles_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    articles_error: Mapped[str | None] = mapped_column(Text, nullable=True)
```

- [ ] **Step 6: Add `articles_status` and `articles_error` to `MizanDocument`**

In `backend/app/db/models/document.py`, add two lines after the existing status-related columns (after `processing_status`). First read `document.py` to find the right location, then add:

```python
    articles_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    articles_error: Mapped[str | None] = mapped_column(Text, nullable=True)
```

- [ ] **Step 7: Register new models in `__init__.py`**

Add to `backend/app/db/models/__init__.py`:

```python
from app.db.models.base_document_article import BaseDocumentArticle  # noqa: F401
from app.db.models.mizan_document_article import MizanDocumentArticle  # noqa: F401
```

- [ ] **Step 8: Run test to verify it passes**

```bash
docker exec mizan-backend-1 python -m pytest tests/test_article_extraction.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 9: Verify backend still starts (no import errors)**

```bash
docker exec mizan-backend-1 python -c "from app.db.models import BaseDocumentArticle, MizanDocumentArticle; print('OK')"
```

Expected: `OK`

- [ ] **Step 10: Commit**

```bash
git add backend/app/db/models/base_document_article.py \
        backend/app/db/models/mizan_document_article.py \
        backend/app/db/models/base_document.py \
        backend/app/db/models/document.py \
        backend/app/db/models/__init__.py \
        backend/tests/test_article_extraction.py
git commit -m "feat: add BaseDocumentArticle and MizanDocumentArticle models"
```

---

### Task 3: Celery Task — `extract_articles_task`

**Files:**
- Create: `backend/app/tasks/extract_articles.py`
- Modify: `backend/app/worker.py` (add to include list)

**Background:** Celery tasks in this project wrap an async function with `asyncio.run()`. The `WorkerAsyncSessionLocal` session factory is used (not the FastAPI `get_db` dependency). The LLM is called via `app.services.llm.chat`. The task reads chunks from `base_document_chunks` (FK: `base_document_id`) or `mizan_document_chunks` (FK: `mizan_document_id`).

The extraction algorithm:
1. Fetch all chunks ordered by `chunk_index`
2. Slide a window of 15 chunks with 2-chunk overlap between batches
3. Concatenate chunk texts with `"\n\n---\n\n"`
4. Call LLM, parse JSON array of `{article_number, article_text}`
5. Deduplicate by `article_number` (exact string, first occurrence wins)
6. Delete existing rows for this document, bulk-insert new ones
7. Update `articles_status` to `"completed"` (or `"failed"` on exception)

- [ ] **Step 1: Write failing test for article deduplication logic**

Add to `backend/tests/test_article_extraction.py`:

```python
def test_deduplicate_keeps_first_occurrence():
    from app.tasks.extract_articles import _deduplicate_articles
    articles = [
        {"article_number": "1", "article_text": "First text"},
        {"article_number": "2", "article_text": "Second text"},
        {"article_number": "1", "article_text": "Duplicate — should be dropped"},
        {"article_number": "3", "article_text": "Third text"},
    ]
    result = _deduplicate_articles(articles)
    assert len(result) == 3
    assert result[0]["article_number"] == "1"
    assert result[0]["article_text"] == "First text"
    assert result[1]["article_number"] == "2"
    assert result[2]["article_number"] == "3"


def test_deduplicate_is_case_sensitive():
    from app.tasks.extract_articles import _deduplicate_articles
    articles = [
        {"article_number": "1", "article_text": "Lowercase"},
        {"article_number": "1", "article_text": "Also lowercase — duplicate"},  # same, dropped
    ]
    result = _deduplicate_articles(articles)
    assert len(result) == 1
```

- [ ] **Step 2: Run to confirm failure**

```bash
docker exec mizan-backend-1 python -m pytest tests/test_article_extraction.py::test_deduplicate_keeps_first_occurrence -v
```

Expected: `ImportError` — `extract_articles` module does not exist yet.

- [ ] **Step 3: Write failing test for batch windowing logic**

Add to `backend/tests/test_article_extraction.py`:

```python
def test_build_batches_overlap():
    from app.tasks.extract_articles import _build_batches

    batch_size, overlap = 5, 2
    chunks = [{"text": str(i)} for i in range(20)]
    batches = _build_batches(chunks, batch_size=batch_size, overlap=overlap)
    # First batch: indices 0-4
    assert [c["text"] for c in batches[0]] == ["0", "1", "2", "3", "4"]
    # Second batch: last 2 of first (3,4) + next 5 (5,6,7,8,9) → indices 3-9
    assert [c["text"] for c in batches[1]] == ["3", "4", "5", "6", "7", "8", "9"]
    # Each batch has at most batch_size + overlap elements
    for batch in batches:
        assert len(batch) <= batch_size + overlap


def test_build_batches_fewer_than_batch_size():
    from app.tasks.extract_articles import _build_batches

    chunks = [{"text": "a"}, {"text": "b"}]
    batches = _build_batches(chunks, batch_size=15, overlap=2)
    assert len(batches) == 1
    assert len(batches[0]) == 2
```

- [ ] **Step 4: Write failing test for JSON parsing**

Add to `backend/tests/test_article_extraction.py`:

```python
def test_parse_llm_response_valid():
    from app.tasks.extract_articles import _parse_llm_extraction

    raw = '[{"article_number": "1", "article_text": "Content of article 1"}]'
    result = _parse_llm_extraction(raw)
    assert result is not None
    assert len(result) == 1
    assert result[0]["article_number"] == "1"


def test_parse_llm_response_strips_markdown():
    from app.tasks.extract_articles import _parse_llm_extraction

    raw = '```json\n[{"article_number": "2", "article_text": "Text"}]\n```'
    result = _parse_llm_extraction(raw)
    assert result is not None
    assert result[0]["article_number"] == "2"


def test_parse_llm_response_invalid_returns_none():
    from app.tasks.extract_articles import _parse_llm_extraction

    result = _parse_llm_extraction("not valid json at all")
    assert result is None
```

- [ ] **Step 5: Run all failing tests**

```bash
docker exec mizan-backend-1 python -m pytest tests/test_article_extraction.py -v
```

Expected: All new tests `ERROR` (module not found).

- [ ] **Step 6: Create `backend/app/tasks/extract_articles.py`**

```python
"""Extract numbered articles from documents using LLM."""
import asyncio
import json
import logging
from uuid import UUID

from sqlalchemy import delete, select

from app.db.models.base_document import BaseDocument
from app.db.models.base_document_article import BaseDocumentArticle
from app.db.models.base_document_chunk import BaseDocumentChunk
from app.db.models.document import MizanDocument
from app.db.models.mizan_document_article import MizanDocumentArticle
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
from app.services.llm import chat as llm_chat
from app.worker import celery_app

logger = logging.getLogger(__name__)

BATCH_SIZE = 15
OVERLAP = 2

SYSTEM_PROMPT = (
    "You are a legal document parser. Your task is to extract all numbered articles, "
    "sections, clauses, or provisions from the provided text.\n\n"
    "Rules:\n"
    "- Extract items numbered with Arabic numerals (1, 2, 3...), alphabetic (a, b, c...), "
    "Roman numerals (I, II, III...), hierarchical (1.1, 2.3.4...), or named sections "
    "(Article 5, Section III, Clause 7).\n"
    "- For each item, capture the FULL text of that article/section including all sub-items "
    "that belong to it.\n"
    "- Do NOT split an article from its sub-clauses.\n"
    "- Do NOT invent article numbers. Only extract what is explicitly numbered in the text.\n"
    "- Return ONLY a JSON array. No explanation, no markdown, no preamble.\n\n"
    'Output format:\n[{"article_number": "1", "article_text": "Full text..."}]'
)


def _build_batches(chunks: list, batch_size: int = BATCH_SIZE, overlap: int = OVERLAP) -> list[list]:
    """Slide a window of batch_size chunks with overlap between batches."""
    if not chunks:
        return []
    batches = []
    step = batch_size  # unique chunks added each iteration
    i = 0
    while i < len(chunks):
        batch = chunks[max(0, i - overlap) : i + batch_size] if i > 0 else chunks[i : i + batch_size]
        batches.append(batch)
        i += batch_size
    return batches


def _deduplicate_articles(articles: list[dict]) -> list[dict]:
    """Keep first occurrence of each article_number (exact string match, case-sensitive)."""
    seen: set[str] = set()
    result = []
    for a in articles:
        num = a.get("article_number", "")
        if num and num not in seen:
            seen.add(num)
            result.append(a)
    return result


def _parse_llm_extraction(raw_text: str) -> list[dict] | None:
    """Strip markdown fences and parse JSON array from LLM response."""
    try:
        clean = raw_text.strip()
        if clean.startswith("```"):
            parts = clean.split("```")
            clean = parts[1] if len(parts) > 1 else clean
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip()
        data = json.loads(clean)
        if not isinstance(data, list):
            return None
        return [item for item in data if "article_number" in item and "article_text" in item]
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse LLM extraction response: %s", e)
        return None


async def _extract_articles(document_id: str, document_type: str) -> None:
    """
    Core async extraction pipeline.
    document_type: "base" | "user"
    """
    doc_uuid = UUID(document_id)

    async with AsyncSessionLocal() as db:
        # Load document and set status to processing
        if document_type == "base":
            doc = await db.get(BaseDocument, doc_uuid)
        else:
            doc = await db.get(MizanDocument, doc_uuid)

        if not doc:
            logger.error("Document %s not found (type=%s)", document_id, document_type)
            return

        doc.articles_status = "processing"
        doc.articles_error = None
        await db.commit()

        try:
            # Fetch chunks ordered by chunk_index
            if document_type == "base":
                stmt = (
                    select(BaseDocumentChunk)
                    .where(BaseDocumentChunk.base_document_id == doc_uuid)
                    .order_by(BaseDocumentChunk.chunk_index)
                )
            else:
                stmt = (
                    select(MizanDocumentChunk)
                    .where(MizanDocumentChunk.mizan_document_id == doc_uuid)
                    .order_by(MizanDocumentChunk.chunk_index)
                )
            result = await db.execute(stmt)
            chunks = result.scalars().all()

            if not chunks:
                logger.warning("No chunks found for document %s — cannot extract articles", document_id)
                doc.articles_status = "failed"
                doc.articles_error = "No chunks available for extraction"
                await db.commit()
                return

            # Build batches and extract
            batches = _build_batches(list(chunks), BATCH_SIZE, OVERLAP)
            all_articles: list[dict] = []

            for batch_idx, batch in enumerate(batches):
                text = "\n\n---\n\n".join(c.text for c in batch)
                user_prompt = (
                    "Extract all numbered articles, sections, clauses, and provisions "
                    "from the following document text:\n\n" + text
                )
                try:
                    raw = await llm_chat(
                        messages=[
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": user_prompt},
                        ],
                        max_tokens=4096,
                        temperature=0,
                    )
                    parsed = _parse_llm_extraction(raw)
                    if parsed:
                        all_articles.extend(parsed)
                    else:
                        logger.warning("Batch %d for doc %s returned no parseable articles", batch_idx, document_id)
                except Exception as e:
                    logger.warning("Batch %d LLM call failed for doc %s: %s", batch_idx, document_id, e)

            # Deduplicate and assign indices
            deduped = _deduplicate_articles(all_articles)

            # Delete existing, bulk-insert new (idempotent)
            if document_type == "base":
                await db.execute(delete(BaseDocumentArticle).where(BaseDocumentArticle.base_document_id == doc_uuid))
                for idx, item in enumerate(deduped):
                    db.add(BaseDocumentArticle(
                        base_document_id=doc_uuid,
                        article_index=idx,
                        article_number=item["article_number"],
                        article_text=item["article_text"],
                    ))
            else:
                await db.execute(delete(MizanDocumentArticle).where(MizanDocumentArticle.mizan_document_id == doc_uuid))
                for idx, item in enumerate(deduped):
                    db.add(MizanDocumentArticle(
                        mizan_document_id=doc_uuid,
                        article_index=idx,
                        article_number=item["article_number"],
                        article_text=item["article_text"],
                    ))

            doc.articles_status = "completed"
            await db.commit()
            logger.info("Article extraction complete for %s: %d articles", document_id, len(deduped))

        except Exception as e:
            logger.exception("Article extraction failed for %s: %s", document_id, e)
            # Must rollback before any further DB operations — session may be dirty
            await db.rollback()
            if document_type == "base":
                doc = await db.get(BaseDocument, doc_uuid)
            else:
                doc = await db.get(MizanDocument, doc_uuid)
            if doc:
                doc.articles_status = "failed"
                doc.articles_error = str(e)[:500]
                await db.commit()


@celery_app.task(name="tasks.extract_articles")
def extract_articles_task(document_id: str, document_type: str) -> None:
    asyncio.run(_extract_articles(document_id, document_type))
```

- [ ] **Step 7: Add task to `worker.py` include list**

In `backend/app/worker.py`, add `"app.tasks.extract_articles"` to the `include` list:

```python
include=[
    "app.tasks.processing",
    "app.tasks.analysis",
    "app.tasks.process_base_document",
    "app.tasks.process_user_document",
    "app.tasks.compare_documents",
    "app.tasks.extract_articles",   # ← add this line
],
```

- [ ] **Step 8: Run all tests to verify they pass**

```bash
docker exec mizan-backend-1 python -m pytest tests/test_article_extraction.py -v
```

Expected: All 9 tests PASS.

- [ ] **Step 9: Force-recreate worker to pick up new task module**

```bash
docker-compose up -d --force-recreate worker
```

Then verify the task is registered:

```bash
docker exec mizan-worker-1 python -c "from app.tasks.extract_articles import extract_articles_task; print(extract_articles_task.name)"
```

Expected: `tasks.extract_articles`

- [ ] **Step 10: Commit**

```bash
git add backend/app/tasks/extract_articles.py backend/app/worker.py backend/tests/test_article_extraction.py
git commit -m "feat: add extract_articles_task Celery task"
```

---

## Chunk 2: API Endpoints, Auto-trigger, Superadmin UI

### Task 4: API Endpoints + Extend `BaseDocOut`

**Files:**
- Modify: `backend/app/api/v1/base_documents.py`

**Background:** `base_documents.py` already has `BaseDocOut` (Pydantic model), `_to_out()` helper, and a router. We add:
1. Two new fields to `BaseDocOut`: `articles_status: str | None = None` and `articles_error: str | None = None`
2. Update `_to_out()` to populate them
3. New GET endpoint: `GET /superadmin/base-documents/{doc_id}/articles?limit=50&offset=0`
4. New POST endpoint: `POST /superadmin/base-documents/{doc_id}/extract-articles`

- [ ] **Step 1: Write failing test for `BaseDocOut` fields**

Add to `backend/tests/test_article_extraction.py`:

```python
def test_base_doc_out_has_articles_fields():
    from app.api.v1.base_documents import BaseDocOut
    import inspect
    fields = BaseDocOut.model_fields
    assert "articles_status" in fields
    assert "articles_error" in fields
    # Both should be nullable
    assert fields["articles_status"].default is None
    assert fields["articles_error"].default is None
```

- [ ] **Step 2: Run to confirm failure**

```bash
docker exec mizan-backend-1 python -m pytest tests/test_article_extraction.py::test_base_doc_out_has_articles_fields -v
```

Expected: FAIL — `articles_status` not in fields.

- [ ] **Step 3: Update `BaseDocOut` in `base_documents.py`**

Add two fields to the existing `BaseDocOut` class (after `uploaded_by: str`):

```python
class BaseDocOut(BaseModel):
    id: str
    filename: str
    doc_type: str
    processing_status: str
    chunk_count: int
    file_size: int | None
    uploaded_by: str
    created_at: datetime
    articles_status: str | None = None   # ← add
    articles_error: str | None = None    # ← add
```

- [ ] **Step 4: Update `_to_out()` to include new fields**

In `base_documents.py`, update the `_to_out` function:

```python
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
        articles_status=d.articles_status,
        articles_error=d.articles_error,
    )
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
docker exec mizan-backend-1 python -m pytest tests/test_article_extraction.py::test_base_doc_out_has_articles_fields -v
```

Expected: PASS.

- [ ] **Step 6: Add the GET articles endpoint**

Add these imports at the top of `base_documents.py` (alongside existing imports):

```python
from sqlalchemy import func                                          # ← add alongside existing `from sqlalchemy import select`
from app.db.models.base_document_article import BaseDocumentArticle
from app.tasks.extract_articles import extract_articles_task
```

Then add the two new endpoints before the `# ── User-facing endpoint` section:

```python
@router.get("/superadmin/base-documents/{doc_id}/articles")
async def get_base_doc_articles(
    doc_id: str,
    limit: int = 50,
    offset: int = 0,
    _=Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(BaseDocument, uuid.UUID(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")

    stmt = (
        select(BaseDocumentArticle)
        .where(BaseDocumentArticle.base_document_id == doc.id)
        .order_by(BaseDocumentArticle.article_index)
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    articles = result.scalars().all()

    total = await db.scalar(
        select(func.count(BaseDocumentArticle.id)).where(BaseDocumentArticle.base_document_id == doc.id)
    )

    return {
        "articles": [
            {
                "id": str(a.id),
                "article_index": a.article_index,
                "article_number": a.article_number,
                "article_text": a.article_text,
            }
            for a in articles
        ],
        "total": total,
        "articles_status": doc.articles_status,
        "articles_error": doc.articles_error,
    }


@router.post("/superadmin/base-documents/{doc_id}/extract-articles")
async def trigger_article_extraction(
    doc_id: str,
    _=Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(BaseDocument, uuid.UUID(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.processing_status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Document not ready yet (status: {doc.processing_status}). Chunks must be ingested first.",
        )

    doc.articles_status = "pending"
    doc.articles_error = None
    await db.commit()

    extract_articles_task.delay(str(doc.id), "base")

    return {"articles_status": "pending", "message": "Extraction queued"}
```

- [ ] **Step 7: Force-recreate backend to reload code**

```bash
docker-compose up -d --force-recreate backend
```

- [ ] **Step 8: Test endpoints manually**

First get a base document ID that is `completed`:
```bash
curl -s -H "Authorization: Bearer $(curl -s -X POST http://localhost:8001/superadmin/login -H 'Content-Type: application/json' -d '{"email":"admin@mizan.com","password":"admin123"}' | python -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')" http://localhost:8001/superadmin/base-documents | python -c "import sys,json; docs=json.load(sys.stdin); [print(d['id'], d['processing_status']) for d in docs[:3]]"
```

Then test the articles endpoint (replace `{DOC_ID}`):
```bash
TOKEN=$(curl -s -X POST http://localhost:8001/superadmin/login -H 'Content-Type: application/json' -d '{"email":"admin@mizan.com","password":"admin123"}' | python -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8001/superadmin/base-documents/{DOC_ID}/articles
```

Expected: `{"articles": [], "total": 0, "articles_status": null, "articles_error": null}`

Test extract endpoint:
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:8001/superadmin/base-documents/{DOC_ID}/extract-articles
```

Expected: `{"articles_status": "pending", "message": "Extraction queued"}`

After ~30 seconds check status:
```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8001/superadmin/base-documents/{DOC_ID} | python -c "import sys,json; d=json.load(sys.stdin); print(d['articles_status'], d.get('articles_error'))"
```

Expected: `completed None` (or `failed <error>` if LLM call fails)

- [ ] **Step 9: Commit**

```bash
git add backend/app/api/v1/base_documents.py backend/tests/test_article_extraction.py
git commit -m "feat: add articles endpoints and extend BaseDocOut"
```

---

### Task 5: Auto-trigger Extraction After Ingestion

**Files:**
- Modify: `backend/app/tasks/process_base_document.py`

**Background:** After `doc.processing_status = "completed"` is committed, we queue `extract_articles_task` in the same `try` block (before the `finally`). The extraction task reads from DB chunks, not the file — the `finally` block deletes the file but that happens after the task is already queued.

- [ ] **Step 1: Add the auto-trigger in `process_base_document.py`**

After line 117 (`await db.commit()`) in `process_base_document.py`, add the import and the trigger call. The import goes at the top of the file (with other imports):

At the top of `process_base_document.py`, add:
```python
from app.tasks.extract_articles import extract_articles_task
```

After the `await db.commit()` on line 117 (after setting `processing_status = "completed"`), add the trigger wrapped in its own try/except so a Redis failure does not incorrectly mark a successfully-processed document as failed:

```python
            # Queue article extraction now that chunks are in DB — non-fatal if this fails
            try:
                doc.articles_status = "pending"
                await db.commit()
                extract_articles_task.delay(str(doc.id), "base")
                logger.info("Queued article extraction for %s", doc_id)
            except Exception as trigger_err:
                logger.warning("Failed to queue article extraction for %s: %s", doc_id, trigger_err)
```

- [ ] **Step 2: Verify the change manually**

Upload a new test document via the superadmin UI at `http://localhost:8003/documents`. After it reaches `completed` status, check that `articles_status` transitions from `pending` → `processing` → `completed`:

```bash
docker exec mizan-backend-1 python -c "
import asyncio
from app.db.session import WorkerAsyncSessionLocal
from app.db.models.base_document import BaseDocument
from sqlalchemy import select

async def check():
    async with WorkerAsyncSessionLocal() as db:
        result = await db.execute(select(BaseDocument).order_by(BaseDocument.created_at.desc()).limit(3))
        for d in result.scalars().all():
            print(d.filename, d.processing_status, d.articles_status)

asyncio.run(check())
"
```

- [ ] **Step 3: Force-recreate both services to pick up changes**

```bash
docker-compose up -d --force-recreate backend worker
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/tasks/process_base_document.py
git commit -m "feat: auto-trigger article extraction after base document ingestion"
```

---

### Task 6: Superadmin UI — Articles Tab

**Files:**
- Modify: `superadmin/src/pages/DocumentDetail.tsx`

**Background:** `DocumentDetail.tsx` currently has two tabs: "Chunks" and "Document". We add a third "Articles" tab. The existing `refetchInterval` condition only polls while `processing_status` is active — we must extend it to also poll while `articles_status` is active (since extraction starts after processing completes). The `BaseDoc` interface must be extended with `articles_status` and `articles_error`.

The Articles tab shows:
- A status badge for `articles_status`
- A "Re-extract" button that calls `POST /superadmin/base-documents/{id}/extract-articles`
- A table of articles (article number + truncated text)
- An empty state when no articles exist yet

The tab is always visible once `processing_status === "completed"`.

- [ ] **Step 1: Update `BaseDoc` interface**

In `DocumentDetail.tsx`, extend the `BaseDoc` interface:

```typescript
interface BaseDoc {
  id: string;
  filename: string;
  doc_type: string;
  processing_status: string;
  chunk_count: number;
  file_size: number | null;
  file_path?: string;
  uploaded_by: string;
  created_at: string;
  articles_status: string | null;   // ← add
  articles_error: string | null;    // ← add
}
```

- [ ] **Step 2: Extend `activeTab` type**

Change the `useState` for `activeTab` from `"chunks" | "documents"` to include `"articles"`:

```typescript
const [activeTab, setActiveTab] = useState<"chunks" | "documents" | "articles">("chunks");
```

- [ ] **Step 3: Fix the `refetchInterval` to also poll during article extraction**

Replace the existing `refetchInterval` callback:

```typescript
refetchInterval: (query) => {
  const data = query.state.data;
  const docProcessing = data?.processing_status === "processing" || data?.processing_status === "pending";
  const articlesProcessing = data?.articles_status === "pending" || data?.articles_status === "processing";
  return docProcessing || articlesProcessing ? 3000 : false;
},
```

- [ ] **Step 4: Add module-level interfaces and the articles data query**

First add these two interfaces at module scope — place them alongside the existing `BaseDoc`, `Chunk`, and `ChunksResponse` interfaces near the top of the file (NOT inside the component function body, TypeScript does not allow interface declarations inside functions):

```typescript
interface Article {
  id: string;
  article_index: number;
  article_number: string;
  article_text: string;
}

interface ArticlesResponse {
  articles: Article[];
  total: number;
  articles_status: string | null;
  articles_error: string | null;
}
```

Then inside the `DocumentDetail` component, after the existing `chunksData` query, add:

```typescript
const { data: articlesData, isLoading: articlesLoading } = useQuery<ArticlesResponse>({
  queryKey: ["base-doc-articles", id],
  queryFn: () => api.get(`/superadmin/base-documents/${id}/articles`).then(r => r.data),
  enabled: doc?.processing_status === "completed",
});
```

- [ ] **Step 5: Add the Re-extract mutation**

After the `deleteMutation`, add:

```typescript
const extractMutation = useMutation({
  mutationFn: () => api.post(`/superadmin/base-documents/${id}/extract-articles`),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["base-doc", id] });
    qc.invalidateQueries({ queryKey: ["base-doc-articles", id] });
  },
});
```

- [ ] **Step 6: Add the Articles tab button**

In the tab buttons section (after the "Document" button), add:

```tsx
<button
  onClick={() => setActiveTab("articles")}
  className={`px-4 py-2 text-sm font-medium transition-colors ${
    activeTab === "articles"
      ? "text-slate-900 border-b-2 border-slate-900 -mb-px"
      : "text-gray-600 hover:text-gray-900"
  }`}
>
  Articles
  {doc.articles_status && (
    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium ${
      doc.articles_status === "completed" ? "bg-green-100 text-green-700" :
      doc.articles_status === "failed" ? "bg-red-100 text-red-700" :
      "bg-yellow-100 text-yellow-700"
    }`}>
      {doc.articles_status === "completed" ? `${articlesData?.total ?? "—"}` :
       doc.articles_status === "processing" ? "…" :
       doc.articles_status === "pending" ? "queued" : doc.articles_status}
    </span>
  )}
</button>
```

- [ ] **Step 7: Add the Articles tab content**

After the `{activeTab === "documents" && ...}` block, add:

```tsx
{activeTab === "articles" && (
  <div className="space-y-4">
    {/* Header row: status badge + Re-extract button */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Extraction status:</span>
        {!doc.articles_status && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Never extracted</span>
        )}
        {doc.articles_status === "pending" && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Queued</span>
        )}
        {doc.articles_status === "processing" && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full animate-pulse">Extracting…</span>
        )}
        {doc.articles_status === "completed" && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            Completed — {articlesData?.total ?? 0} articles
          </span>
        )}
        {doc.articles_status === "failed" && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Failed</span>
        )}
      </div>
      <button
        onClick={() => extractMutation.mutate()}
        disabled={extractMutation.isPending || doc.articles_status === "pending" || doc.articles_status === "processing"}
        className="text-sm font-medium px-3 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors"
      >
        {extractMutation.isPending ? "Queuing…" : "Re-extract Articles"}
      </button>
    </div>

    {/* Error message if failed */}
    {doc.articles_status === "failed" && doc.articles_error && (
      <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700">
        {doc.articles_error}
      </div>
    )}

    {/* Processing notice */}
    {(doc.articles_status === "pending" || doc.articles_status === "processing") && (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        Extracting articles from chunks using AI. Page auto-refreshes every 3 seconds.
      </div>
    )}

    {/* Articles table */}
    {doc.articles_status === "completed" && (
      articlesLoading ? (
        <div className="text-sm text-gray-500">Loading articles...</div>
      ) : !articlesData?.articles.length ? (
        <div className="text-center py-8 text-sm text-gray-500">
          No articles extracted yet. Click Re-extract Articles to begin.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2 w-24">Article #</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Text</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {articlesData.articles.map(article => (
                <tr key={article.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs font-medium text-slate-700 align-top">
                    {article.article_number}
                  </td>
                  <td className="px-4 py-2 text-gray-700 align-top">
                    <ArticleTextCell text={article.article_text} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    )}

    {/* Empty state before any extraction */}
    {!doc.articles_status && (
      <div className="text-center py-8 text-sm text-gray-500">
        No articles extracted yet. Click Re-extract Articles to begin.
      </div>
    )}
  </div>
)}
```

- [ ] **Step 8: Add the `ArticleTextCell` component**

Add this small component above the `DocumentDetail` function (in the same file):

```tsx
function ArticleTextCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;
  return (
    <div>
      <span>{expanded || !isLong ? text : text.slice(0, 200) + "…"}</span>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-2 text-xs text-blue-600 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
```

`useState` is already imported at the top of `DocumentDetail.tsx` via `import { useState } from "react"` — no additional import needed.

- [ ] **Step 9: Rebuild superadmin frontend**

```bash
docker-compose up -d --force-recreate superadmin
```

Wait for build to complete, then open `http://localhost:8003` → login → Documents → click a completed document → click "Articles" tab.

Verify:
- "Articles" tab is visible for completed documents
- Status badge shows "Never extracted" initially
- "Re-extract Articles" button is enabled
- Clicking Re-extract queues extraction and badge changes to "Queued" then "Extracting…" then "Completed"
- After completion, articles table shows extracted articles with article numbers and truncated text
- "Show more" / "Show less" works for long article text
- Page auto-refreshes during extraction (no manual refresh needed)

- [ ] **Step 10: Commit**

```bash
git add superadmin/src/pages/DocumentDetail.tsx
git commit -m "feat: add Articles tab to superadmin DocumentDetail with re-extraction UI"
```

---

## Final Verification

- [ ] Upload a new base document via `http://localhost:8003/documents`
- [ ] Watch it process through Noesia (status: processing → completed)
- [ ] Confirm `articles_status` automatically transitions to pending → processing → completed (page auto-refreshes)
- [ ] Open Articles tab: verify articles are listed with meaningful article numbers (e.g., "1", "2.1", "Article 5")
- [ ] Click "Re-extract Articles": confirm it re-queues and re-runs successfully (idempotent)
- [ ] Check `GET /superadmin/base-documents/{id}` response includes `articles_status` and `articles_error` fields
- [ ] Check `GET /superadmin/base-documents/{id}/articles` returns article list with `total`
- [ ] Confirm worker logs show extraction progress: `docker logs mizan-worker-1 --tail 50`
