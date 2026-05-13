# LLM Article Extraction Design Spec

**Date:** 2026-05-13  
**Status:** Approved  
**Author:** Ali (approved brainstorming session)

---

## Overview

Replace chunk-based compliance comparison with article-level comparison. An LLM extracts structured articles (numbered clauses, sections, provisions) from both base documents and user documents. Compliance analysis then maps articles from Document B to their corresponding articles in Document A, producing a semantically meaningful clause-by-clause report instead of noisy chunk fragments.

---

## Problem

Current chunk-based comparison produces low-quality compliance reports because:
1. Chunks split articles at arbitrary byte boundaries — one article may span 3 chunks
2. Compliance findings reference "Chunk 12" which users cannot map to real document structure
3. The LLM must infer article boundaries mid-comparison, leading to hallucinations

---

## Solution

Extract articles as a separate, explicit pipeline step. Store them in dedicated tables. Use articles — not chunks — as the unit of comparison.

---

## Data Model

### New Table: `base_document_articles`

```sql
CREATE TABLE base_document_articles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_document_id UUID NOT NULL REFERENCES base_documents(id) ON DELETE CASCADE,
    article_index    INTEGER NOT NULL,      -- ordering (0-based)
    article_number   VARCHAR(50) NOT NULL,  -- "1", "2.3", "Article 5", "IV"
    article_text     TEXT NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON base_document_articles(base_document_id, article_index);
```

### New Table: `mizan_document_articles`

```sql
CREATE TABLE mizan_document_articles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES mizan_documents(id) ON DELETE CASCADE,
    article_index    INTEGER NOT NULL,
    article_number   VARCHAR(50) NOT NULL,
    article_text     TEXT NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON mizan_document_articles(document_id, article_index);
```

### New Column: `articles_status` on `base_documents`

```sql
ALTER TABLE base_documents ADD COLUMN articles_status VARCHAR(20) DEFAULT NULL;
-- Values: NULL (never started) | 'pending' | 'processing' | 'completed' | 'failed'
```

### New Column: `articles_status` on `mizan_documents`

```sql
ALTER TABLE mizan_documents ADD COLUMN articles_status VARCHAR(20) DEFAULT NULL;
```

---

## Extraction Pipeline

### Trigger

- **Base documents**: Superadmin triggers extraction manually via UI (Re-extract button) OR automatically after `processing_status` transitions to `'completed'` in `process_base_document_task`.
- **User documents**: Extraction is triggered automatically after `process_user_document_task` completes ingestion (Noesia ingest job finishes successfully).

### Celery Task: `extract_articles_task(document_id: str, document_type: str)`

`document_type` is either `"base"` or `"user"`.

**Algorithm:**

```
1. Load document record; set articles_status = 'processing'
2. Fetch all chunks from DB (base_document_chunks or mizan_document_chunks), ordered by chunk_index
3. Batch chunks into groups of 15 (overlap: last 2 chunks of previous batch prepended to next)
4. For each batch:
   a. Concatenate chunk texts with separator "\n\n---\n\n"
   b. Call LLM with extraction prompt (see below)
   c. Parse JSON response → list of {article_number, article_text}
   d. Accumulate results
5. Deduplicate by article_number (keep first occurrence; later batches may re-emit boundary articles)
6. Assign article_index (0-based, in order of first appearance)
7. Bulk insert into base_document_articles or mizan_document_articles
   - Delete existing rows for this document_id first (idempotent re-extraction)
8. Set articles_status = 'completed' (or 'failed' on exception)
```

### LLM Extraction Prompt

**System:**
```
You are a legal document parser. Your task is to extract all numbered articles, sections, clauses, or provisions from the provided text.

Rules:
- Extract items numbered with Arabic numerals (1, 2, 3...), alphabetic (a, b, c...), Roman numerals (I, II, III...), hierarchical (1.1, 2.3.4...), or named sections (Article 5, Section III, Clause 7).
- For each item, capture the FULL text of that article/section including all sub-items that belong to it.
- Do NOT split an article from its sub-clauses.
- Do NOT invent article numbers. Only extract what is explicitly numbered in the text.
- Return ONLY a JSON array. No explanation, no markdown, no preamble.

Output format:
[
  {"article_number": "1", "article_text": "Full text of article 1..."},
  {"article_number": "1.1", "article_text": "Full text of sub-article 1.1..."},
  ...
]
```

**User:**
```
Extract all numbered articles, sections, clauses, and provisions from the following document text:

{concatenated_chunk_text}
```

### Error Handling

- If LLM returns malformed JSON: log warning, skip batch, continue with remaining batches
- If all batches fail: set `articles_status = 'failed'`, store error in a `detail` JSONB field (optional, for debugging)
- Re-extraction is always safe (delete-then-insert pattern)

---

## API Endpoints

### Superadmin

**GET `/superadmin/base-documents/{doc_id}/articles`**  
Returns paginated list of extracted articles.

Response:
```json
{
  "articles": [
    {"id": "uuid", "article_index": 0, "article_number": "1", "article_text": "..."}
  ],
  "total": 42,
  "articles_status": "completed"
}
```

**POST `/superadmin/base-documents/{doc_id}/extract-articles`**  
Triggers (or re-triggers) article extraction for a base document.  
Requires `processing_status == 'completed'` (chunks must exist).

Response:
```json
{"articles_status": "pending", "message": "Extraction queued"}
```

### User-facing

**GET `/documents/{doc_id}/articles`**  
Returns articles for the user's document (same structure as above, scoped by tenant).

---

## Superadmin UI Changes

### Base Document Detail → Articles Tab

Add a new **"Articles"** tab alongside existing tabs (Chunks, etc.) in the base document detail view (or in the base documents list page, as a panel).

Tab contents:
- Status badge: `articles_status` (null=Never Extracted, pending=Queued, processing=Extracting…, completed=Completed, failed=Failed)
- **Re-extract** button (always visible; queues a new extraction)
- Auto-refresh: poll every 3s while `articles_status ∈ {pending, processing}`
- Table: Article # | Article Text (truncated to 200 chars with expand)
- Empty state: "No articles extracted yet. Click Re-extract to begin."

---

## Compliance Comparison Changes

### Pre-flight Check

In `compare_documents_task` (or the comparison service), before starting analysis:

```python
if base_doc.articles_status != "completed":
    raise ValueError("Base document articles not extracted yet")
if user_doc.articles_status != "completed":
    raise ValueError("User document articles not extracted yet")
```

Return a clear error to the frontend if articles are not ready.

### Comparison Loop

Replace chunk iteration with article iteration:

```python
base_articles = await db.execute(
    select(BaseDocumentArticle)
    .where(BaseDocumentArticle.base_document_id == base_doc_id)
    .order_by(BaseDocumentArticle.article_index)
)

user_articles = await db.execute(
    select(MizanDocumentArticle)
    .where(MizanDocumentArticle.document_id == user_doc_id)
    .order_by(MizanDocumentArticle.article_index)
)

for base_article in base_articles:
    # Search user articles for coverage of this base article
    # (semantic match — use existing vector search or LLM comparison)
    finding = ComplianceFinding(
        doc_a_section=f"Article {base_article.article_number}",
        doc_b_section=f"Article {matched_user_article.article_number}" if match else None,
        ...
    )
```

The `doc_a_section` field stores `"Article {number}"` — human-readable, not `"Chunk 12"`.

### Backward Compatibility

Documents that were analyzed before this feature (no articles extracted) continue to show their existing chunk-based findings. New analyses require article extraction.

---

## Frontend Changes (Mizan App)

### No Breaking Changes

The compliance results UI already reads `doc_a_section` from the API. Since `doc_a_section` now contains `"Article 5"` instead of `"Chunk 12"`, the display automatically improves with no code change.

### Analyze Button Guard

The `POST /documents/{doc_id}/analyze` endpoint should check `articles_status` and return HTTP 422 with a clear message if articles are not yet extracted, so the frontend can display a user-friendly error.

Optional: show an "Articles not ready" inline warning on the document card if `articles_status != 'completed'`.

---

## Migration

1. Add `articles_status` column to `base_documents` and `mizan_documents` (nullable, defaults to NULL)
2. Create `base_document_articles` table
3. Create `mizan_document_articles` table
4. No data migration needed — extraction is triggered on-demand

---

## Implementation Order

1. **DB migration** — new tables + columns
2. **SQLAlchemy models** — `BaseDocumentArticle`, `MizanDocumentArticle`; add `articles_status` to existing models
3. **Celery task** — `extract_articles_task`
4. **API endpoints** — superadmin + user-facing
5. **Auto-trigger** — hook into `process_base_document_task` and `process_user_document_task`
6. **Comparison update** — `compare_documents_task` uses articles
7. **Superadmin UI** — Articles tab + Re-extract button
8. **Frontend guard** — `articles_status` check on analyze

---

## Success Criteria

- [ ] After extraction, `GET /superadmin/base-documents/{id}/articles` returns all numbered articles
- [ ] Compliance findings reference `"Article 5"` not `"Chunk 12"`
- [ ] Re-extraction is idempotent (safe to run multiple times)
- [ ] `articles_status` reflects real pipeline state with no stale values
- [ ] Superadmin can see extraction status and trigger re-extraction from UI
- [ ] Analysis blocked with clear error if articles not ready

---

## Out of Scope

- Semantic deduplication across batches (string match on `article_number` is sufficient)
- Article hierarchy visualization in UI
- Per-article confidence scores
- Comparison of documents without Noesia chunks (PDF-direct path)
