# LangGraph Article Extraction Agent — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing regex/fallback `extract_articles` Celery task with a LangGraph multi-node agent that uses LLM reasoning to find every article in any document — regardless of structure, language, or numbering format.

**Architecture:** A linear LangGraph graph with five nodes: `fetch_markdown → analyze_document → extract_articles → validate_extraction → save_to_db`. The agent fetches the full Noesia markdown once, uses one LLM call to understand the document's structure and article unit, a second call to extract all articles, and a third call for a full re-read validation pass before persisting. The existing Celery task wrapper stays in place — only the inner `_extract_articles` implementation is replaced.

**Tech Stack:** Python 3.12, LangGraph 1.2.x, LiteLLM (existing), SQLAlchemy 2 async, Celery (unchanged interface)

---

## File Structure

```
backend/
  requirements.txt                              ← add langgraph>=1.2.0,<2.0.0

  app/services/article_extraction/
    __init__.py                                 ← exports run_extraction_agent()
    state.py                                    ← ExtractionState TypedDict
    prompts.py                                  ← all LLM system/user prompt strings
    nodes.py                                    ← all 5 node functions
    graph.py                                    ← builds + compiles the LangGraph graph

  app/tasks/extract_articles.py                 ← replace _extract_articles() body only;
                                                   keep Celery task decorator + DB save logic

  tests/test_article_extraction.py              ← extend existing test file; keep old tests
  tests/test_extraction_agent.py                ← new: unit tests for nodes and graph
```

**Why this decomposition:**
- `state.py` — single source of truth for what flows between nodes; easy to extend
- `prompts.py` — all prompt text in one place; easy to tune without touching logic
- `nodes.py` — each node is a pure async function `(state) -> dict`; trivially testable
- `graph.py` — wires nodes together; keeping it separate means nodes can be unit-tested without building the graph
- The Celery task file keeps its existing interface so nothing upstream changes

---

## Chunk 1: Dependencies + State

### Task 1: Add LangGraph to requirements and rebuild

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1:** Add `langgraph>=1.2.0,<2.0.0` to `backend/requirements.txt` after the `litellm` line.

```
litellm>=1.0.0,<2.0.0
langgraph>=1.2.0,<2.0.0
```

- [ ] **Step 2:** Rebuild and restart the backend container so langgraph is installed.

```bash
docker compose build backend worker
docker compose up -d backend worker
```

- [ ] **Step 3:** Verify the install.

```bash
docker compose exec backend python -c "import langgraph; print(langgraph.__version__)"
```
Expected: prints `1.2.x`

- [ ] **Step 4:** Commit.

```bash
git add backend/requirements.txt
git commit -m "feat: add langgraph dependency"
```

---

### Task 2: Define ExtractionState

**Files:**
- Create: `backend/app/services/article_extraction/__init__.py`
- Create: `backend/app/services/article_extraction/state.py`

- [ ] **Step 1:** Write a failing test for the state shape.

```python
# tests/test_extraction_agent.py
from app.services.article_extraction.state import ExtractionState

def test_extraction_state_has_required_keys():
    state: ExtractionState = {
        "document_id": "abc",
        "document_type": "base",
        "markdown": "## Article 1:\nText",
        "analysis": {},
        "articles": [],
        "validated_articles": [],
        "error": None,
    }
    assert state["document_id"] == "abc"
    assert state["articles"] == []
```

- [ ] **Step 2:** Run to confirm it fails (module doesn't exist yet).

```bash
docker compose exec backend pytest tests/test_extraction_agent.py::test_extraction_state_has_required_keys -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3:** Create `__init__.py`.

```python
# app/services/article_extraction/__init__.py
from .graph import run_extraction_agent

__all__ = ["run_extraction_agent"]
```

- [ ] **Step 4:** Create `state.py`.

```python
# app/services/article_extraction/state.py
from __future__ import annotations
from typing import TypedDict


class DocumentAnalysis(TypedDict):
    """LLM's understanding of the document structure."""
    document_type: str          # e.g. "labor law", "data governance policy", "cybersecurity standard"
    article_unit: str           # e.g. "Article", "Section", "Clause", "Control"
    numbering_format: str       # e.g. "Eastern Arabic", "Western digits", "Roman", "mixed"
    language: str               # e.g. "English", "Arabic", "bilingual"
    estimated_count: int        # LLM's estimate of total article count


class ExtractionState(TypedDict):
    # ── Inputs ──────────────────────────────────────────────────────────────
    document_id: str            # UUID string of the document
    document_type: str          # "base" | "user"

    # ── Intermediate ────────────────────────────────────────────────────────
    markdown: str               # full Noesia markdown; empty string if fetch failed
    analysis: DocumentAnalysis  # output of analyze_document node

    # ── Outputs ─────────────────────────────────────────────────────────────
    articles: list[dict]            # raw extraction: [{articleNumber, articleText}]
    validated_articles: list[dict]  # after validation pass; this is what gets saved
    error: str | None               # set if any node fails fatally
```

- [ ] **Step 5:** Run the test — it should pass now.

```bash
docker compose exec backend pytest tests/test_extraction_agent.py::test_extraction_state_has_required_keys -v
```
Expected: `PASSED`

- [ ] **Step 6:** Commit.

```bash
git add backend/app/services/article_extraction/ backend/tests/test_extraction_agent.py
git commit -m "feat: add ExtractionState TypedDict for LangGraph agent"
```

---

## Chunk 2: Prompts

### Task 3: Define all LLM prompts

**Files:**
- Create: `backend/app/services/article_extraction/prompts.py`

The prompts are the heart of the agent. They must handle any document type, any language, and any numbering scheme.

- [ ] **Step 1:** Write a test that the prompt module exports exactly the expected names.

```python
# tests/test_extraction_agent.py  (append)

def test_prompts_module_exports():
    from app.services.article_extraction import prompts
    assert hasattr(prompts, "ANALYZE_SYSTEM")
    assert hasattr(prompts, "ANALYZE_USER")
    assert hasattr(prompts, "EXTRACT_SYSTEM")
    assert hasattr(prompts, "EXTRACT_USER")
    assert hasattr(prompts, "VALIDATE_SYSTEM")
    assert hasattr(prompts, "VALIDATE_USER")
    # All are non-empty strings
    for name in ["ANALYZE_SYSTEM", "ANALYZE_USER", "EXTRACT_SYSTEM",
                 "EXTRACT_USER", "VALIDATE_SYSTEM", "VALIDATE_USER"]:
        value = getattr(prompts, name)
        assert isinstance(value, str) and len(value) > 50
```

- [ ] **Step 2:** Run to confirm it fails.

```bash
docker compose exec backend pytest tests/test_extraction_agent.py::test_prompts_module_exports -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3:** Create `prompts.py`.

```python
# app/services/article_extraction/prompts.py
"""
All LLM prompt strings for the article extraction agent.
Kept separate so they can be tuned without touching node logic.
"""

# ── Node 2: Analyze document structure ────────────────────────────────────────

ANALYZE_SYSTEM = """\
You are a legal and regulatory document analyst.

Your task is to read a document and identify its structural unit — the atomic
numbered provision that functions as a law article, policy clause, standard
control, or equivalent.

Documents can be:
- National laws with "Article (١):" style headings (Arabic or Western numerals)
- Policy documents with "4.1 . Scope" numbered sections
- Technical standards with "1-1-1" table-based controls
- Contracts with "Clause 3" or "Section A" provisions
- Any other structured regulatory/legal document in any language

Return a JSON object with exactly these keys:
{
  "document_type": "<brief label, e.g. 'labor law', 'data governance policy'>",
  "article_unit": "<what to call the provision, e.g. 'Article', 'Section', 'Clause', 'Control'>",
  "numbering_format": "<how provisions are numbered, e.g. 'Eastern Arabic in parentheses', 'Western digits with dot notation', 'hyphenated control codes'>",
  "language": "<'English', 'Arabic', or 'bilingual'>",
  "estimated_count": <integer estimate of total provisions>
}

Return ONLY valid JSON. No explanation, no markdown fences.\
"""

ANALYZE_USER = """\
Analyze the structure of this document and return the JSON described:

{markdown}\
"""

# ── Node 3: Extract all articles ──────────────────────────────────────────────

EXTRACT_SYSTEM = """\
You are a legal document parser. Extract every numbered provision from the document.

Context about this document:
- Document type: {document_type}
- Provision unit: {article_unit}
- Numbering format: {numbering_format}
- Language: {language}
- Estimated number of provisions: {estimated_count}

Extraction rules:
1. Extract EVERY provision — do not skip any, even if the text seems short.
2. The provision number is exactly as it appears in the document (keep original
   characters: ١٢٣ not 123, IV not 4, etc.).
3. The provision text is everything between this provision's heading and the
   next provision's heading. Include bullet points, sub-clauses, lists.
4. Sub-provisions (e.g. 4.1, 4.2) that belong to a parent (4) should be
   merged into the parent's text, marked as [4.1] and [4.2] inline.
5. Remove noise lines: "Logo", "Line chart", "Icon", "<!-- image -->",
   HTML comments, table separator rows (|---|).
6. Do NOT include the Table of Contents or any index page.
7. Do NOT invent provisions. Only extract what is explicitly in the document.

Return a JSON array. Each element:
{
  "articleNumber": "<provision number exactly as in document>",
  "articleText": "<full clean text of the provision>"
}

Return ONLY the JSON array. No explanation, no markdown fences.\
"""

EXTRACT_USER = """\
Extract all {article_unit} provisions from this document:

{markdown}\
"""

# ── Node 4: Validate — second full read ───────────────────────────────────────

VALIDATE_SYSTEM = """\
You are a legal document auditor. You will be given:
1. A document's full text
2. A list of provisions already extracted from it

Your job is to re-read the document carefully and find anything that was MISSED.

What counts as missed:
- A provision heading exists in the document but is not in the extracted list
- A provision heading appears without "##" (plain text) and was skipped
- Any numbered provision, clause, article, section, or control not in the list

Numbering context:
- Provisions can be numbered with Eastern Arabic (١٢٣), Western digits (123),
  Roman numerals (I, IV, XI), letters (A, B), or any mixture
- They may appear as "## Article (١):" OR as plain text "Article (١):" on its own line
- A provision heading is always on its own line and is entirely the heading

Return a JSON object with exactly these keys:
{
  "is_complete": <true if nothing was missed, false if gaps found>,
  "missed_provisions": [
    {
      "articleNumber": "<number>",
      "articleText": "<full text>"
    }
  ]
}

If is_complete is true, missed_provisions must be an empty array [].
Return ONLY valid JSON. No explanation, no markdown fences.\
"""

VALIDATE_USER = """\
Re-read this document and find any provisions NOT in the extracted list.

Already extracted ({count} provisions):
{extracted_summary}

Full document:
{markdown}\
"""
```

- [ ] **Step 4:** Run test.

```bash
docker compose exec backend pytest tests/test_extraction_agent.py::test_prompts_module_exports -v
```
Expected: `PASSED`

- [ ] **Step 5:** Commit.

```bash
git add backend/app/services/article_extraction/prompts.py
git commit -m "feat: add LLM prompts for analyze/extract/validate nodes"
```

---

## Chunk 3: Nodes

### Task 4: Implement all five node functions

**Files:**
- Create: `backend/app/services/article_extraction/nodes.py`

Each node is `async def name(state: ExtractionState) -> dict` — it returns only the keys it updates.

- [ ] **Step 1:** Write unit tests for the two pure helper functions (JSON parsing and noise cleaning) inside nodes.

```python
# tests/test_extraction_agent.py  (append)

def test_parse_json_array_valid():
    from app.services.article_extraction.nodes import _parse_json_array
    raw = '[{"articleNumber": "1", "articleText": "Content"}]'
    result = _parse_json_array(raw)
    assert result is not None
    assert len(result) == 1
    assert result[0]["articleNumber"] == "1"

def test_parse_json_array_strips_fences():
    from app.services.article_extraction.nodes import _parse_json_array
    raw = '```json\n[{"articleNumber": "2", "articleText": "X"}]\n```'
    result = _parse_json_array(raw)
    assert result is not None
    assert result[0]["articleNumber"] == "2"

def test_parse_json_array_invalid_returns_none():
    from app.services.article_extraction.nodes import _parse_json_array
    assert _parse_json_array("not json") is None

def test_parse_json_object_valid():
    from app.services.article_extraction.nodes import _parse_json_object
    raw = '{"document_type": "law", "estimated_count": 10}'
    result = _parse_json_object(raw)
    assert result["document_type"] == "law"
    assert result["estimated_count"] == 10

def test_parse_json_object_invalid_returns_none():
    from app.services.article_extraction.nodes import _parse_json_object
    assert _parse_json_object("[1,2,3]") is None  # array, not object
```

- [ ] **Step 2:** Run to confirm they fail.

```bash
docker compose exec backend pytest tests/test_extraction_agent.py -k "parse_json" -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3:** Create `nodes.py`.

```python
# app/services/article_extraction/nodes.py
"""
LangGraph node functions for the article extraction agent.

Each node is an async function (state: ExtractionState) -> dict.
It returns only the keys it writes to state.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.services.article_extraction.state import ExtractionState
from app.services.article_extraction import prompts
from app.services.llm import chat as llm_chat
from app.services.noesia import NoesiaClient, NoesiaError

logger = logging.getLogger(__name__)

# ── JSON parsing helpers ───────────────────────────────────────────────────────

def _strip_fences(text: str) -> str:
    """Remove markdown code fences (```json ... ```) if present."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        # parts[1] is the content between first pair of fences
        inner = parts[1] if len(parts) > 1 else text
        if inner.startswith("json"):
            inner = inner[4:]
        return inner.strip()
    return text


def _parse_json_array(raw: str) -> list[dict] | None:
    """Parse a JSON array from LLM output. Returns None on failure."""
    try:
        data = json.loads(_strip_fences(raw))
        if not isinstance(data, list):
            return None
        return data
    except json.JSONDecodeError:
        logger.warning("_parse_json_array: failed to parse: %s…", raw[:200])
        return None


def _parse_json_object(raw: str) -> dict | None:
    """Parse a JSON object from LLM output. Returns None on failure."""
    try:
        data = json.loads(_strip_fences(raw))
        if not isinstance(data, dict):
            return None
        return data
    except json.JSONDecodeError:
        logger.warning("_parse_json_object: failed to parse: %s…", raw[:200])
        return None


# ── Node 1: fetch_markdown ─────────────────────────────────────────────────────

async def fetch_markdown(state: ExtractionState) -> dict:
    """
    Fetch the full document markdown from Noesia.
    Sets state["markdown"] on success, state["error"] on failure.
    """
    from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
    from sqlalchemy import select
    import uuid

    doc_id = uuid.UUID(state["document_id"])
    doc_type = state["document_type"]

    async with AsyncSessionLocal() as db:
        if doc_type == "base":
            from app.db.models.base_document import BaseDocument
            doc = await db.get(BaseDocument, doc_id)
        else:
            from app.db.models.document import MizanDocument
            doc = await db.get(MizanDocument, doc_id)

        if not doc:
            return {"error": f"Document {doc_id} not found (type={doc_type})"}

        noesia_doc_id = getattr(doc, "noesia_document_id", None)
        if not noesia_doc_id:
            return {"error": f"Document {doc_id} has no Noesia document ID"}

    try:
        client = NoesiaClient()
        markdown = await client.get_document_content(str(noesia_doc_id))
        logger.info("fetch_markdown: fetched %d chars for %s", len(markdown), doc_id)
        return {"markdown": markdown, "error": None}
    except NoesiaError as exc:
        return {"error": f"Noesia fetch failed: {exc}"}
    except Exception as exc:
        return {"error": f"Unexpected error fetching markdown: {exc}"}


# ── Node 2: analyze_document ──────────────────────────────────────────────────

async def analyze_document(state: ExtractionState) -> dict:
    """
    Ask the LLM to identify the document's structure and article unit.
    Sets state["analysis"].
    """
    if state.get("error"):
        return {}  # skip if already failed

    markdown = state["markdown"]
    # Cap at 8000 chars for analysis — the structure is apparent from the start
    sample = markdown[:8000]

    messages = [
        {"role": "system", "content": prompts.ANALYZE_SYSTEM},
        {"role": "user", "content": prompts.ANALYZE_USER.format(markdown=sample)},
    ]

    try:
        raw = await llm_chat(messages, max_tokens=400, temperature=0)
        analysis = _parse_json_object(raw)
        if not analysis:
            logger.warning("analyze_document: could not parse LLM response, using defaults")
            analysis = {
                "document_type": "unknown",
                "article_unit": "Article",
                "numbering_format": "unknown",
                "language": "unknown",
                "estimated_count": 0,
            }
        logger.info("analyze_document: %s", analysis)
        return {"analysis": analysis}
    except Exception as exc:
        logger.warning("analyze_document failed: %s — using defaults", exc)
        return {
            "analysis": {
                "document_type": "unknown",
                "article_unit": "Article",
                "numbering_format": "unknown",
                "language": "unknown",
                "estimated_count": 0,
            }
        }


# ── Node 3: extract_articles ──────────────────────────────────────────────────

async def extract_articles(state: ExtractionState) -> dict:
    """
    Ask the LLM to extract all articles from the full markdown.
    Sets state["articles"].
    """
    if state.get("error"):
        return {}

    analysis = state.get("analysis", {})
    markdown = state["markdown"]

    system = prompts.EXTRACT_SYSTEM.format(
        document_type=analysis.get("document_type", "unknown"),
        article_unit=analysis.get("article_unit", "Article"),
        numbering_format=analysis.get("numbering_format", "unknown"),
        language=analysis.get("language", "unknown"),
        estimated_count=analysis.get("estimated_count", 0),
    )
    user = prompts.EXTRACT_USER.format(
        article_unit=analysis.get("article_unit", "Article"),
        markdown=markdown,
    )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    try:
        raw = await llm_chat(messages, max_tokens=16000, temperature=0)
        articles = _parse_json_array(raw)
        if articles is None:
            logger.warning("extract_articles: LLM returned unparseable response")
            articles = []
        # Normalise keys — accept either "articleNumber" or "article_number"
        normalised = []
        for a in articles:
            num = a.get("articleNumber") or a.get("article_number", "")
            text = a.get("articleText") or a.get("article_text", "")
            if num and text:
                normalised.append({"articleNumber": str(num), "articleText": str(text)})
        logger.info("extract_articles: found %d articles", len(normalised))
        return {"articles": normalised}
    except Exception as exc:
        logger.warning("extract_articles failed: %s", exc)
        return {"articles": [], "error": f"Extraction LLM call failed: {exc}"}


# ── Node 4: validate_extraction ───────────────────────────────────────────────

async def validate_extraction(state: ExtractionState) -> dict:
    """
    Second LLM pass: re-read the full document to find any missed articles.
    Merges missed provisions into the extracted list.
    Sets state["validated_articles"].
    """
    if state.get("error"):
        return {"validated_articles": state.get("articles", [])}

    articles = state.get("articles", [])
    markdown = state["markdown"]

    # Build a compact summary for the prompt (number + first 80 chars of text)
    summary_lines = [
        f"[{a['articleNumber']}] {a['articleText'][:80].strip()}…"
        for a in articles
    ]
    extracted_summary = "\n".join(summary_lines)

    messages = [
        {"role": "system", "content": prompts.VALIDATE_SYSTEM},
        {
            "role": "user",
            "content": prompts.VALIDATE_USER.format(
                count=len(articles),
                extracted_summary=extracted_summary,
                markdown=markdown,
            ),
        },
    ]

    try:
        raw = await llm_chat(messages, max_tokens=8000, temperature=0)
        result = _parse_json_object(raw)

        if not result:
            logger.warning("validate_extraction: could not parse response — skipping merge")
            return {"validated_articles": articles}

        is_complete = result.get("is_complete", True)
        missed = result.get("missed_provisions", [])

        if is_complete or not missed:
            logger.info("validate_extraction: complete — no missed provisions")
            return {"validated_articles": articles}

        # Normalise missed provisions
        normalised_missed = []
        for a in missed:
            num = a.get("articleNumber") or a.get("article_number", "")
            text = a.get("articleText") or a.get("article_text", "")
            if num and text:
                normalised_missed.append({"articleNumber": str(num), "articleText": str(text)})

        logger.info("validate_extraction: found %d missed provisions", len(normalised_missed))

        # Merge: existing articles + missed (deduplicate by articleNumber)
        seen = {a["articleNumber"] for a in articles}
        merged = list(articles)
        for a in normalised_missed:
            if a["articleNumber"] not in seen:
                merged.append(a)
                seen.add(a["articleNumber"])

        return {"validated_articles": merged}

    except Exception as exc:
        logger.warning("validate_extraction failed: %s — using unvalidated list", exc)
        return {"validated_articles": articles}


# ── Node 5: save_to_db ────────────────────────────────────────────────────────

async def save_to_db(state: ExtractionState) -> dict:
    """
    Persist validated_articles to the database.
    Deletes existing rows first (idempotent).
    Updates document.articles_status to 'completed' or 'failed'.
    """
    from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
    from sqlalchemy import delete
    import uuid

    doc_id = uuid.UUID(state["document_id"])
    doc_type = state["document_type"]
    articles = state.get("validated_articles", state.get("articles", []))
    fatal_error = state.get("error")

    async with AsyncSessionLocal() as db:
        if doc_type == "base":
            from app.db.models.base_document import BaseDocument
            from app.db.models.base_document_article import BaseDocumentArticle
            doc = await db.get(BaseDocument, doc_id)
            Article = BaseDocumentArticle
            fk_field = "base_document_id"
        else:
            from app.db.models.document import MizanDocument
            from app.db.models.mizan_document_article import MizanDocumentArticle
            doc = await db.get(MizanDocument, doc_id)
            Article = MizanDocumentArticle
            fk_field = "mizan_document_id"

        if not doc:
            logger.error("save_to_db: document %s not found", doc_id)
            return {}

        if fatal_error:
            doc.articles_status = "failed"
            doc.articles_error = str(fatal_error)[:500]
            await db.commit()
            return {}

        try:
            # Delete existing rows
            await db.execute(
                delete(Article).where(getattr(Article, fk_field) == doc_id)
            )
            # Insert new rows
            for idx, item in enumerate(articles):
                db.add(Article(
                    **{fk_field: doc_id},
                    article_index=idx,
                    article_number=item["articleNumber"],
                    article_text=item["articleText"],
                ))
            doc.articles_status = "completed"
            doc.articles_error = None
            await db.commit()
            logger.info("save_to_db: saved %d articles for %s", len(articles), doc_id)
        except Exception as exc:
            logger.exception("save_to_db: DB write failed for %s: %s", doc_id, exc)
            await db.rollback()
            doc = await db.get(
                __import__("app.db.models.base_document", fromlist=["BaseDocument"]).BaseDocument
                if doc_type == "base" else
                __import__("app.db.models.document", fromlist=["MizanDocument"]).MizanDocument,
                doc_id
            )
            if doc:
                doc.articles_status = "failed"
                doc.articles_error = str(exc)[:500]
                await db.commit()

    return {}
```

- [ ] **Step 4:** Run the JSON helper tests.

```bash
docker compose exec backend pytest tests/test_extraction_agent.py -k "parse_json" -v
```
Expected: all `PASSED`

- [ ] **Step 5:** Commit.

```bash
git add backend/app/services/article_extraction/nodes.py
git commit -m "feat: implement all 5 LangGraph node functions"
```

---

## Chunk 4: Graph + Celery Integration

### Task 5: Build the LangGraph graph

**Files:**
- Create: `backend/app/services/article_extraction/graph.py`

- [ ] **Step 1:** Write a test that the graph compiles and has the right nodes.

```python
# tests/test_extraction_agent.py  (append)

def test_graph_compiles():
    from app.services.article_extraction.graph import build_graph
    graph = build_graph()
    # LangGraph compiled graphs expose .nodes
    assert "fetch_markdown" in graph.nodes
    assert "analyze_document" in graph.nodes
    assert "extract_articles" in graph.nodes
    assert "validate_extraction" in graph.nodes
    assert "save_to_db" in graph.nodes
```

- [ ] **Step 2:** Run to confirm it fails.

```bash
docker compose exec backend pytest tests/test_extraction_agent.py::test_graph_compiles -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3:** Create `graph.py`.

```python
# app/services/article_extraction/graph.py
"""
Builds and compiles the LangGraph article extraction graph.

Graph: fetch_markdown → analyze_document → extract_articles
                      → validate_extraction → save_to_db → END
"""
from __future__ import annotations

import asyncio
import logging

from langgraph.graph import StateGraph, END

from app.services.article_extraction.state import ExtractionState
from app.services.article_extraction.nodes import (
    fetch_markdown,
    analyze_document,
    extract_articles,
    validate_extraction,
    save_to_db,
)

logger = logging.getLogger(__name__)


def build_graph() -> StateGraph:
    """Return a compiled LangGraph graph for article extraction."""
    builder = StateGraph(ExtractionState)

    builder.add_node("fetch_markdown", fetch_markdown)
    builder.add_node("analyze_document", analyze_document)
    builder.add_node("extract_articles", extract_articles)
    builder.add_node("validate_extraction", validate_extraction)
    builder.add_node("save_to_db", save_to_db)

    builder.set_entry_point("fetch_markdown")
    builder.add_edge("fetch_markdown", "analyze_document")
    builder.add_edge("analyze_document", "extract_articles")
    builder.add_edge("extract_articles", "validate_extraction")
    builder.add_edge("validate_extraction", "save_to_db")
    builder.add_edge("save_to_db", END)

    return builder.compile()


# Module-level compiled graph (reused across Celery task invocations)
_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


async def run_extraction_agent(document_id: str, document_type: str) -> None:
    """
    Entry point called by the Celery task.
    Builds initial state, runs the graph, and returns when done.
    """
    initial_state: ExtractionState = {
        "document_id": document_id,
        "document_type": document_type,
        "markdown": "",
        "analysis": {},
        "articles": [],
        "validated_articles": [],
        "error": None,
    }
    graph = _get_graph()
    final_state = await graph.ainvoke(initial_state)
    logger.info(
        "run_extraction_agent complete: doc=%s articles=%d error=%s",
        document_id,
        len(final_state.get("validated_articles", [])),
        final_state.get("error"),
    )
```

- [ ] **Step 4:** Run test.

```bash
docker compose exec backend pytest tests/test_extraction_agent.py::test_graph_compiles -v
```
Expected: `PASSED`

- [ ] **Step 5:** Commit.

```bash
git add backend/app/services/article_extraction/graph.py
git commit -m "feat: build and compile LangGraph extraction graph"
```

---

### Task 6: Replace the Celery task body

**Files:**
- Modify: `backend/app/tasks/extract_articles.py`

Replace the `_extract_articles` async function with a one-liner that calls `run_extraction_agent`. Keep all other existing code (imports, helpers, Celery decorator) intact — they may be referenced by tests or other tasks.

- [ ] **Step 1:** Run the existing extraction tests to establish baseline.

```bash
docker compose exec backend pytest tests/test_article_extraction.py -v
```
Expected: all `PASSED`

- [ ] **Step 2:** Replace the `_extract_articles` function body only (lines 300–418).

Find the function:
```python
async def _extract_articles(document_id: str, document_type: str) -> None:
```

Replace its entire body with:

```python
async def _extract_articles(document_id: str, document_type: str) -> None:
    """Delegate to the LangGraph extraction agent."""
    from app.services.article_extraction import run_extraction_agent
    await run_extraction_agent(document_id, document_type)
```

Keep the `@celery_app.task` decorator and `extract_articles_task` function below unchanged.

- [ ] **Step 3:** Run the existing tests again — they must still pass.

```bash
docker compose exec backend pytest tests/test_article_extraction.py -v
```
Expected: all `PASSED` (tests that import helpers from the old code still work)

- [ ] **Step 4:** Commit.

```bash
git add backend/app/tasks/extract_articles.py
git commit -m "feat: replace extract_articles task body with LangGraph agent"
```

---

## Chunk 5: End-to-End Verification

### Task 7: Smoke test against real documents

- [ ] **Step 1:** Restart the worker to pick up the new code.

```bash
docker compose restart worker backend
```

- [ ] **Step 2:** Trigger re-extraction for LABOR LAW (doc ID `2608041a-4616-4a63-b9e6-94605be29a1f`) via the superadmin UI at `http://localhost:8003`. Click "Re-extract Articles" on the document detail page.

- [ ] **Step 3:** Watch worker logs for the LangGraph run.

```bash
docker compose logs worker -f --tail=50
```
Expected output includes:
```
fetch_markdown: fetched XXXXX chars for 2608041a...
analyze_document: {'document_type': 'labor law', ...}
extract_articles: found ~245 articles
validate_extraction: ...
save_to_db: saved 245 articles for 2608041a...
```

- [ ] **Step 4:** Verify article count in the superadmin UI — should show exactly 245 articles.

- [ ] **Step 5:** Trigger re-extraction for PoliciesEn (doc ID `c9f3da24-ac81-44be-aac9-3a47d5254a56`). Verify 8 articles appear.

- [ ] **Step 6:** Run all tests to confirm nothing is broken.

```bash
docker compose exec backend pytest tests/ -v
```
Expected: all `PASSED`

- [ ] **Step 7:** Final commit.

```bash
git add .
git commit -m "feat: LangGraph article extraction agent — complete implementation"
git push origin HEAD:master
```

---

## Summary

| Task | Files | Purpose |
|------|-------|---------|
| 1 | `requirements.txt` | Add langgraph dependency |
| 2 | `state.py`, `__init__.py` | ExtractionState TypedDict |
| 3 | `prompts.py` | All 3 LLM prompts |
| 4 | `nodes.py` | 5 node functions |
| 5 | `graph.py` | Compiled LangGraph graph + entry point |
| 6 | `extract_articles.py` | Wire Celery task to agent |
| 7 | — | Smoke test against live documents |

The old helper functions (`_parse_heading_articles`, `_parse_table_controls`, `_extract_with_llm`, etc.) remain in `extract_articles.py` and are still covered by their existing tests. They are no longer called in production but can be removed in a future cleanup once the agent is confirmed stable.
