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
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_document_id UUID NOT NULL REFERENCES base_documents(id) ON DELETE CASCADE,
    article_index    INTEGER NOT NULL,      -- ordering (0-based)
    article_number   VARCHAR(50) NOT NULL,  -- "1", "2.3", "Article 5", "IV"
    article_text     TEXT NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON base_document_articles(base_document_id, article_index);
```

### New Table: `mizan_document_articles`

The FK column is named `mizan_document_id` to match the existing `mizan_document_chunks.mizan_document_id` column naming convention (not `document_id`).

```sql
CREATE TABLE mizan_document_articles (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mizan_document_id  UUID NOT NULL REFERENCES mizan_documents(id) ON DELETE CASCADE,
    article_index      INTEGER NOT NULL,
    article_number     VARCHAR(50) NOT NULL,
    article_text       TEXT NOT NULL,
    created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON mizan_document_articles(mizan_document_id, article_index);
```

### New Columns: `articles_status` and `articles_error` on `base_documents`

```sql
ALTER TABLE base_documents
    ADD COLUMN articles_status VARCHAR(20) DEFAULT NULL,
    ADD COLUMN articles_error  TEXT DEFAULT NULL;
-- articles_status values: NULL (never started) | 'pending' | 'processing' | 'completed' | 'failed'
-- articles_error: last error message from extraction; NULL when status is not 'failed'
```

### New Columns: `articles_status` and `articles_error` on `mizan_documents`

```sql
ALTER TABLE mizan_documents
    ADD COLUMN articles_status VARCHAR(20) DEFAULT NULL,
    ADD COLUMN articles_error  TEXT DEFAULT NULL;
```

### Pydantic Model Changes: `BaseDocOut`

Add two fields to `BaseDocOut` in `backend/app/api/v1/base_documents.py`:

```python
articles_status: str | None = None
articles_error: str | None = None
```

Also update the `_to_out()` helper function to include both fields:

```python
def _to_out(d: BaseDocument) -> BaseDocOut:
    return BaseDocOut(
        ...existing fields...,
        articles_status=d.articles_status,
        articles_error=d.articles_error,
    )
```

Without updating `_to_out()`, the fields will always be `None` regardless of DB state.

### `articles_status` Added to Existing API Responses

`articles_status` and `articles_error` are added to:
- `BaseDocOut` Pydantic model (returned by `GET /superadmin/base-documents/{id}` and list endpoints)
- The existing `GET /superadmin/base-documents/{id}` poll already used by the superadmin UI

This means the Articles tab can piggyback on the existing 3-second poll for `processing_status` — no second HTTP request is needed. The tab shows `articles_status` from the same response.

---

## Extraction Pipeline

### Trigger

- **Base documents**: Superadmin triggers extraction manually via UI (Re-extract button) OR automatically after `processing_status` transitions to `'completed'` in `process_base_document_task`.
- **User documents**: Extraction is triggered automatically after `process_user_document_task` completes ingestion (Noesia ingest job finishes successfully). If extraction fails (`articles_status = 'failed'`), recovery requires re-uploading the document — there is no separate re-trigger endpoint for user documents.

**Important:** The extraction task reads chunk text from the `base_document_chunks` or `mizan_document_chunks` tables (already in the DB at trigger time). The file path is not passed to the task and is not needed — `process_base_document_task` deletes the uploaded file in its `finally` block after ingestion completes.

### Celery Task: `extract_articles_task(document_id: str, document_type: str)`

`document_type` is either `"base"` or `"user"`.

**Algorithm:**

```
1. Load document record; set articles_status = 'processing', articles_error = NULL; commit
2. Fetch all chunks from DB (base_document_chunks or mizan_document_chunks),
   ordered by chunk_index
   - base: WHERE base_document_id = document_id
   - user: WHERE mizan_document_id = document_id
3. Batch chunks into groups of 15 (overlap: last 2 chunks of previous batch prepended to next)
4. For each batch:
   a. Concatenate chunk texts with separator "\n\n---\n\n"
   b. Call LLM with extraction prompt (see below)
   c. Parse JSON response → list of {article_number, article_text}
   d. Accumulate results; if LLM returns malformed JSON, log warning and skip batch
5. Deduplicate by article_number (exact string match, case-sensitive): keep first occurrence;
   later batches re-emit boundary articles due to overlap — these duplicates are discarded.
   NOTE: If a document uses numbering restarts (e.g., two appendices both numbered 1, 2, 3),
   this deduplication will incorrectly merge them. Accepted limitation for this implementation.
6. Assign article_index (0-based, in order of first appearance)
7. Within a DB transaction:
   a. DELETE existing rows for this document (idempotent re-extraction)
   b. Bulk INSERT new rows into base_document_articles or mizan_document_articles
   c. Set articles_status = 'completed'; commit
8. On any unhandled exception: set articles_status = 'failed',
   articles_error = str(exception); commit
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

---

## API Endpoints

### Superadmin

**GET `/superadmin/base-documents/{doc_id}/articles?limit=50&offset=0`**  
Returns paginated list of extracted articles.  
Auth: `require_superadmin` dependency.

Query parameters:
- `limit: int = 50` — max articles per page
- `offset: int = 0` — pagination offset

Response:
```json
{
  "articles": [
    {"id": "uuid", "article_index": 0, "article_number": "1", "article_text": "..."}
  ],
  "total": 42,
  "articles_status": "completed",
  "articles_error": null
}
```

Returns HTTP 404 if `doc_id` not found.

**POST `/superadmin/base-documents/{doc_id}/extract-articles`**  
Triggers (or re-triggers) article extraction for a base document.  
Auth: `require_superadmin` dependency.  
Requires `processing_status == 'completed'` (chunks must exist).  
Returns HTTP 400 if `processing_status != 'completed'`.

Response (200):
```json
{"articles_status": "pending", "message": "Extraction queued"}
```

### User-facing

**GET `/documents/{doc_id}/articles?limit=50&offset=0`**  
Returns articles for the user's document.  
Auth: `require_user` JWT dependency. Verifies `doc.tenant_id == user.tenant_id`.  
Returns HTTP 404 if not found or belongs to another tenant (do not distinguish — always 404).

Response structure: same as superadmin endpoint above.

---

## Superadmin UI Changes

### Base Document Detail → Articles Tab

Add a third **"Articles"** tab to the existing tab group in the base document detail view. This is alongside the existing "Chunks" and "Document" tabs — not a separate panel on the list page.

The Articles tab uses the same `GET /superadmin/base-documents/{doc_id}` response already polled for `processing_status`. No additional HTTP request is needed — `articles_status` is included in `BaseDocOut`.

**However**, the existing `refetchInterval` condition in `DocumentDetail.tsx` only polls while `processing_status` is `pending` or `processing`. Since article extraction runs after `processing_status` has already reached `"completed"`, the poll will have stopped by then. The refetch condition must be extended:

```typescript
refetchInterval: (query) => {
  const data = query.state.data;
  const docProcessing = data?.processing_status === "processing" || data?.processing_status === "pending";
  const articlesProcessing = data?.articles_status === "pending" || data?.articles_status === "processing";
  return docProcessing || articlesProcessing ? 3000 : false;
},
```

Without this change, the Re-extract progress will not update live — the user must manually refresh.

Tab contents:
- Status badge derived from `articles_status`:
  - `null` → "Never Extracted" (gray)
  - `pending` → "Queued" (yellow)
  - `processing` → "Extracting…" (blue, spinner)
  - `completed` → "Completed" (green)
  - `failed` → "Failed" (red) + show `articles_error` message below badge
- **Re-extract** button (always visible; calls `POST /superadmin/base-documents/{id}/extract-articles`; disabled while `articles_status` is `pending` or `processing`)
- Auto-refresh: the existing 3-second poll already covers this (no new polling logic needed)
- Table: columns = Article # | Article Text (truncated to 200 chars; click to expand full text)
- Empty state: "No articles extracted yet. Click Re-extract to begin."

---

## Compliance Comparison Changes

### Pre-flight Check

In `compare_documents_task`, before starting analysis:

```python
if base_doc.articles_status != "completed":
    comparison.status = "failed"
    comparison.error_message = "Base document articles not extracted. Run article extraction first."
    await db.commit()
    return

if user_doc.articles_status != "completed":
    comparison.status = "failed"
    comparison.error_message = "User document articles not extracted. Please wait for processing to complete."
    await db.commit()
    return
```

The `compare_documents_task` already uses a `ComplianceComparison` record with a `status` and `error_message` field; use that same pattern rather than raising an exception that would mark the Celery task as failed.

The `POST /documents/{doc_id}/analyze` endpoint should also check `articles_status` synchronously before queuing the task and return HTTP 400 (matching the existing pattern for similar pre-flight checks in `documents.py`) with a clear message. Example:

```python
if user_doc.articles_status != "completed":
    raise HTTPException(status_code=400, detail="Document articles not ready yet. Please wait for processing to complete.")
if base_doc.articles_status != "completed":
    raise HTTPException(status_code=400, detail="Base document articles not extracted. Contact an administrator.")
```

### Comparison Strategy

For each regulation article (from `base_document_articles`), call the LLM once with:
- The regulation article text as the requirement to check
- All compliance document articles concatenated as the content to search

A new `compare_article` method is added to `ComplianceComparator`. The method uses **unambiguous parameter names** (`regulation_article_number`, `regulation_article_text`, `compliance_articles_text`) to avoid confusion with the existing `doc_a`/`doc_b` convention (where `doc_a` = MizanDocument/compliance, `doc_b` = BaseDocument/regulation in the existing codebase).

#### `compare_article` Method Signature

```python
async def compare_article(
    self,
    regulation_article_number: str,
    regulation_article_text: str,
    compliance_articles_text: str,  # pre-formatted, built once before the loop
) -> dict | None:
    system_prompt = self._build_system_prompt()  # reuse unchanged — "chunk" vs "article" is irrelevant to the LLM
    user_prompt = self._build_article_prompt(
        regulation_article_number, regulation_article_text, compliance_articles_text
    )
    try:
        raw = await self._call_llm(system_prompt, user_prompt)
        return self._parse_article_response(raw, regulation_article_number)
    except Exception as e:
        logger.error(f"Error processing regulation article {regulation_article_number}: {e}")
        return None
```

#### Compliance Comparison LLM Prompt (`_build_article_prompt`)

**User prompt template:**

```
Assess whether the following REGULATION article is covered by the COMPLIANCE DOCUMENT.

REGULATION — Article {regulation_article_number}
============================================================
{regulation_article_text}

COMPLIANCE DOCUMENT
============================================================
{compliance_articles_text}

Return ONLY this JSON (one object, not an array):

{
  "matched_article_number": "<article_number string from the compliance document that best covers this regulation requirement, or null if not covered>",
  "status": "<compliant|gap|conflict|missing>",
  "severity": "<critical|medium|low>",
  "issue": "<one-line description of the compliance problem, or 'Fully compliant'>",
  "recommendation": "<one-line fix, or 'No action required'>"
}

Rules:
- status must be one of: compliant, gap, conflict, missing
- severity must be one of: critical, medium, low
- matched_article_number must be the exact article_number string from the COMPLIANCE DOCUMENT, or null
- If fully compliant, set status=compliant, severity=low, issue='Fully compliant'
```

`compliance_articles_text` is pre-formatted once before the loop (same pattern as `prepare_regulation` in the existing comparator):

```python
compliance_articles_text = "\n\n---\n\n".join(
    f"[Compliance | Article {a.article_number}]\n{a.article_text}"
    for a in user_articles
)
```

#### LLM Response Parsing (`_parse_article_response`)

Follows the same JSON cleaning logic as `_parse_chunk_response`. Full implementation:

```python
def _parse_article_response(self, raw_text: str, regulation_article_number: str) -> dict | None:
    try:
        clean = raw_text.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip()
        data = json.loads(clean)
        return {
            "matched_article_number": data.get("matched_article_number"),  # str or None
            "status": data.get("status", "gap"),
            "severity": data.get("severity", "low"),
            "issue": data.get("issue", ""),
            "recommendation": data.get("recommendation", ""),
        }
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to parse article {regulation_article_number} response: {e}\nRaw: {raw_text[:200]}")
        return None
```

#### Comparison Loop Pseudocode

```python
for i, reg_article in enumerate(regulation_articles):
    result = await comparator.compare_article(
        regulation_article_number=reg_article.article_number,
        regulation_article_text=reg_article.article_text,
        compliance_articles_text=compliance_articles_text,
    )
    if result is None:
        continue  # skip on parse error, same as existing chunk loop

    matched_num = result["matched_article_number"]
    finding = ComplianceFinding(
        id=uuid4(),
        comparison_id=comparison.id,
        doc_a_section=f"Article {reg_article.article_number}",
        doc_b_section=f"Article {matched_num}" if matched_num else "",
        status=result["status"],
        severity=result["severity"],
        issue=result["issue"],
        recommendation=result["recommendation"],
    )
    db.add(finding)

    comparison.current_chunk = i + 1
    comparison.total_chunks = len(regulation_articles)
    await db.commit()
```

Note: `doc_a_section` stores the regulation article reference and `doc_b_section` stores the matching compliance article reference. This is intentionally reversed from the existing chunk-based convention (where `doc_a_section` = compliance chunk). The `ComplianceFinding` model has no semantic constraint on these fields — they are plain text columns.

The existing `current_chunk` / `total_chunks` columns on `ComplianceComparison` track article-level progress. No schema change needed; the frontend progress bar works unchanged.

### Backward Compatibility

Documents analyzed before this feature was deployed (no articles extracted) retain their existing chunk-based findings. New analyses require article extraction on both documents.

---

## Frontend Changes (Mizan App)

### No Breaking Changes

The compliance results UI already reads `doc_a_section` from the API. Since `doc_a_section` now contains `"Article 5"` instead of `"Chunk 12"`, the display automatically improves with no code change.

### Analyze Button Guard (HTTP 400 from backend)

When `POST /documents/{doc_id}/analyze` returns HTTP 400 due to articles not ready, the existing error-handling in the frontend displays the `detail` message. No frontend code change is needed beyond confirming the message is surfaced.

Optional (low priority): show an inline "Articles not ready" badge on the document card when `articles_status != 'completed'`, so users know before clicking Analyze.

---

## Migration

Create a single Alembic revision file `006_add_article_extraction_tables.py` with `revision = "006"` and `down_revision = "005"`.

This revision applies the following DDL changes in order:

1. `ALTER TABLE base_documents ADD COLUMN articles_status VARCHAR(20) DEFAULT NULL`
2. `ALTER TABLE base_documents ADD COLUMN articles_error TEXT DEFAULT NULL`
3. `ALTER TABLE mizan_documents ADD COLUMN articles_status VARCHAR(20) DEFAULT NULL`
4. `ALTER TABLE mizan_documents ADD COLUMN articles_error TEXT DEFAULT NULL`
5. `CREATE TABLE base_document_articles (...)` as specified above
6. `CREATE TABLE mizan_document_articles (...)` as specified above

No data migration needed — extraction is triggered on-demand.

The `downgrade()` function must drop objects in reverse order (tables before columns, to satisfy FK constraints):

1. `DROP TABLE IF EXISTS mizan_document_articles`
2. `DROP TABLE IF EXISTS base_document_articles`
3. `ALTER TABLE mizan_documents DROP COLUMN IF EXISTS articles_error`
4. `ALTER TABLE mizan_documents DROP COLUMN IF EXISTS articles_status`
5. `ALTER TABLE base_documents DROP COLUMN IF EXISTS articles_error`
6. `ALTER TABLE base_documents DROP COLUMN IF EXISTS articles_status`

---

## Implementation Order

1. **DB migration** — Alembic revision `006`
2. **SQLAlchemy models** — `BaseDocumentArticle`, `MizanDocumentArticle`; add `articles_status`/`articles_error` to `BaseDocument` and `MizanDocument`
3. **Celery task** — `extract_articles_task` in `app/tasks/extract_articles.py`; use `@celery_app.task(name="tasks.extract_articles")` to match the naming convention of existing tasks (e.g., `process_base_document_task` uses `name="tasks.process_base_document"`)
4. **API endpoints** — superadmin articles endpoints added to `app/api/v1/base_documents.py`; user-facing `GET /documents/{doc_id}/articles` added to `app/api/v1/documents.py` (existing router with `prefix="/documents"`)
5. **Extend `BaseDocOut`** — add `articles_status`, `articles_error` fields
6. **Auto-trigger** — hook `extract_articles_task.delay()` into `process_base_document_task` and `process_user_document_task` after successful completion
7. **Comparison update** — new `compare_article` method on `ComplianceComparator`; update `compare_documents_task` to use articles
8. **Superadmin UI** — Articles tab in base document detail view
9. **Frontend guard** — verify HTTP 400 error message is surfaced on analyze

---

## Success Criteria

- [ ] After extraction, `GET /superadmin/base-documents/{id}/articles` returns all numbered articles
- [ ] Compliance findings reference `"Article 5"` not `"Chunk 12"`
- [ ] Re-extraction is idempotent (safe to run multiple times)
- [ ] `articles_status` reflects real pipeline state with no stale values
- [ ] Superadmin can see extraction status and trigger re-extraction from the Articles tab
- [ ] Analysis returns HTTP 400 with clear message if articles not ready
- [ ] Progress bar continues to work during article-level comparison

---

## Out of Scope

- Semantic deduplication across batches (string match on `article_number` is sufficient; numbering-restart edge case accepted)
- Article hierarchy visualization in UI
- Per-article confidence scores
- Comparison of documents without Noesia chunks (PDF-direct path)
- Dedicated `articles_status` polling endpoint (piggybacks on existing document record poll)
