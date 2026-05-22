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
        inner = parts[1] if len(parts) > 1 else text
        if inner.startswith("json"):
            inner = inner[4:]
        return inner.strip()
    return text


def _parse_json_array(raw: str) -> list[dict] | None:
    """Parse a JSON array from LLM output, with truncation recovery. Returns None on failure."""
    stripped = _strip_fences(raw)
    try:
        data = json.loads(stripped)
        if isinstance(data, list):
            return data
        return None
    except json.JSONDecodeError:
        pass

    # Truncation recovery: close the array after the last complete object.
    # If max_tokens cut the response mid-element, this salvages all complete articles.
    last_brace = stripped.rfind("}")
    if last_brace > 0:
        try:
            data = json.loads(stripped[:last_brace + 1] + "\n]")
            if isinstance(data, list):
                logger.warning("_parse_json_array: recovered %d items from truncated response", len(data))
                return data
        except json.JSONDecodeError:
            pass

    logger.warning("_parse_json_array: failed to parse: %s…", raw[:200])
    return None


def _parse_json_object(raw: str) -> dict | None:
    """Parse a JSON object from LLM output, with truncation recovery. Returns None on failure."""
    stripped = _strip_fences(raw)
    try:
        data = json.loads(stripped)
        if isinstance(data, dict):
            return data
        return None
    except json.JSONDecodeError:
        pass

    # Truncation recovery for nested objects containing arrays (e.g. validate response).
    last_brace = stripped.rfind("}")
    if last_brace > 0:
        for closing in ["\n]\n}", "\n]}", "]\n}", "]}"]:
            try:
                data = json.loads(stripped[:last_brace + 1] + closing)
                if isinstance(data, dict):
                    logger.warning("_parse_json_object: recovered from truncated response")
                    return data
            except json.JSONDecodeError:
                continue

    logger.warning("_parse_json_object: failed to parse: %s…", raw[:200])
    return None


# ── Node 1: fetch_markdown ─────────────────────────────────────────────────────

async def fetch_markdown(state: ExtractionState) -> dict:
    """
    Fetch the full document markdown from Noesia.
    Sets state["markdown"] on success, state["error"] on failure.
    """
    import uuid

    doc_id = uuid.UUID(state["document_id"])
    doc_type = state["document_type"]

    from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
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
        return {}

    markdown = state["markdown"]
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
        raw = await llm_chat(messages, temperature=0)
        articles = _parse_json_array(raw)
        if articles is None:
            logger.warning("extract_articles: LLM returned unparseable response")
            articles = []
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
        raw = await llm_chat(messages, temperature=0)
        result = _parse_json_object(raw)

        if not result:
            logger.warning("validate_extraction: could not parse response — skipping merge")
            return {"validated_articles": articles}

        is_complete = result.get("is_complete", True)
        missed = result.get("missed_provisions", [])

        if is_complete or not missed:
            logger.info("validate_extraction: complete — no missed provisions")
            return {"validated_articles": articles}

        normalised_missed = []
        for a in missed:
            num = a.get("articleNumber") or a.get("article_number", "")
            text = a.get("articleText") or a.get("article_text", "")
            if num and text:
                normalised_missed.append({"articleNumber": str(num), "articleText": str(text)})

        logger.info("validate_extraction: found %d missed provisions", len(normalised_missed))

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
    import uuid
    from sqlalchemy import delete

    doc_id = uuid.UUID(state["document_id"])
    doc_type = state["document_type"]
    articles = state.get("validated_articles", state.get("articles", []))
    fatal_error = state.get("error")

    from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
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
            await db.execute(
                delete(Article).where(getattr(Article, fk_field) == doc_id)
            )
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
            if doc_type == "base":
                from app.db.models.base_document import BaseDocument as BD
                doc = await db.get(BD, doc_id)
            else:
                from app.db.models.document import MizanDocument as MD
                doc = await db.get(MD, doc_id)
            if doc:
                doc.articles_status = "failed"
                doc.articles_error = str(exc)[:500]
                await db.commit()

    return {}
