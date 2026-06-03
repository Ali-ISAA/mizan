"""
LangGraph node functions for the article extraction agent.

Graph: fetch_markdown → regex_extract → save_to_db

Each node is an async function (state: ExtractionState) -> dict.
It returns only the keys it writes to state.
"""
from __future__ import annotations

import json
import logging
import re

from app.services.article_extraction import prompts
from app.services.article_extraction.state import ExtractionState
from app.services.article_extraction.regex_extractor import extract_articles as regex_extract_articles
from app.services.llm import chat as llm_chat
from app.services.noesia import NoesiaClient, NoesiaError

logger = logging.getLogger(__name__)

# LLM fallback windowing (used only when regex finds no provisions)
_LLM_WINDOW_CHARS = 12_000
_LLM_OVERLAP_CHARS = 500
_ANALYZE_CHARS = 8_000


# ── Node 1: fetch_markdown ─────────────────────────────────────────────────────

async def fetch_markdown(state: ExtractionState) -> dict:
    """
    Fetch the full document markdown from Noesia.
    Sets articles_status to "processing" immediately so the UI reflects progress.
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

        doc.articles_status = "processing"
        doc.articles_error = None
        await db.commit()

    try:
        client = NoesiaClient()
        markdown = await client.get_document_content(str(noesia_doc_id))
        logger.info("fetch_markdown: fetched %d chars for %s", len(markdown), doc_id)
        return {"markdown": markdown, "error": None}
    except NoesiaError as exc:
        return {"error": f"Noesia fetch failed: {exc}"}
    except Exception as exc:
        return {"error": f"Unexpected error fetching markdown: {exc}"}


# ── Node 2: regex_extract ─────────────────────────────────────────────────────

async def regex_extract(state: ExtractionState) -> dict:
    """
    Extract all numbered provisions using fast deterministic regex matching.
    No LLM calls — completes in milliseconds regardless of document size.
    """
    if state.get("error"):
        return {"validated_articles": []}

    markdown = state["markdown"]
    try:
        articles = regex_extract_articles(markdown)
        logger.info("regex_extract: found %d articles", len(articles))
        return {"validated_articles": articles}
    except Exception as exc:
        logger.exception("regex_extract failed: %s", exc)
        return {"validated_articles": [], "error": f"Regex extraction failed: {exc}"}


# ── Node 2b: llm_extract (fallback when regex finds nothing) ──────────────────

def _strip_fences(raw: str) -> str:
    clean = raw.strip()
    clean = re.sub(r"^```(?:json)?\s*", "", clean)
    clean = re.sub(r"\s*```$", "", clean)
    return clean.strip()


def _parse_articles(raw: str) -> list[dict]:
    """Parse an LLM response into [{articleNumber, articleText}], tolerating fences/wrappers."""
    clean = _strip_fences(raw)
    data = None
    try:
        data = json.loads(clean)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", clean, re.DOTALL)
        if m:
            try:
                data = json.loads(m.group(0))
            except json.JSONDecodeError:
                return []
    if isinstance(data, dict):  # some models wrap the array, e.g. {"articles": [...]}
        data = next((v for v in data.values() if isinstance(v, list)), None)
    if not isinstance(data, list):
        return []

    out: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        num = str(item.get("articleNumber") or item.get("article_number") or "").strip()
        text = str(item.get("articleText") or item.get("article_text") or "").strip()
        if num and text:
            out.append({"articleNumber": num, "articleText": text})
    return out


def _windows(markdown: str, size: int, overlap: int) -> list[str]:
    if len(markdown) <= size:
        return [markdown]
    out, i = [], 0
    while i < len(markdown):
        out.append(markdown[i : i + size])
        i += size - overlap
    return out


async def _analyze_structure(markdown: str) -> dict:
    """Ask the LLM what kind of document this is, to prime extraction. Falls back to defaults."""
    defaults = {
        "document_type": "document",
        "article_unit": "Section",
        "numbering_format": "mixed",
        "language": "unknown",
        "estimated_count": 0,
    }
    try:
        raw = await llm_chat(
            messages=[
                {"role": "system", "content": prompts.ANALYZE_SYSTEM},
                {"role": "user", "content": prompts.ANALYZE_USER.format(markdown=markdown[:_ANALYZE_CHARS])},
            ],
            max_tokens=400,
            temperature=0,
        )
        m = re.search(r"\{.*\}", _strip_fences(raw), re.DOTALL)
        info = json.loads(m.group(0)) if m else {}
        return {k: info.get(k, defaults[k]) for k in defaults}
    except Exception as exc:
        logger.warning("llm_extract: structure analysis failed, using defaults: %s", exc)
        return defaults


async def llm_extract(state: ExtractionState) -> dict:
    """
    LLM fallback extraction — runs only when regex found no provisions.
    Handles documents whose structure isn't heading/table based (e.g. contracts,
    free-form policies). Windows the markdown so large documents stay within context.
    """
    if state.get("error"):
        return {}
    markdown = (state.get("markdown") or "").strip()
    if not markdown:
        return {}

    info = await _analyze_structure(markdown)
    system = prompts.EXTRACT_SYSTEM.format(**info)

    collected: list[dict] = []
    windows = _windows(markdown, _LLM_WINDOW_CHARS, _LLM_OVERLAP_CHARS)
    for idx, window in enumerate(windows):
        try:
            raw = await llm_chat(
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompts.EXTRACT_USER.format(article_unit=info["article_unit"], markdown=window)},
                ],
                max_tokens=4096,
                temperature=0,
            )
            collected.extend(_parse_articles(raw))
        except Exception as exc:
            logger.warning("llm_extract: window %d/%d failed for %s: %s", idx + 1, len(windows), state["document_id"], exc)

    # Dedupe by articleNumber, keeping the longest text seen for each.
    best: dict[str, dict] = {}
    order: list[str] = []
    for item in collected:
        num = item["articleNumber"]
        if num not in best:
            best[num] = item
            order.append(num)
        elif len(item["articleText"]) > len(best[num]["articleText"]):
            best[num] = item
    articles = [best[n] for n in order]

    logger.info("llm_extract: extracted %d articles (regex found 0) for %s", len(articles), state["document_id"])
    return {"validated_articles": articles}


# ── Node 3: save_to_db ────────────────────────────────────────────────────────

async def save_to_db(state: ExtractionState) -> dict:
    """
    Persist validated_articles to the database.
    Deletes existing rows first (idempotent re-runs).
    Updates document.articles_status to 'completed' or 'failed'.
    """
    import uuid
    from sqlalchemy import delete

    doc_id = uuid.UUID(state["document_id"])
    doc_type = state["document_type"]
    articles = state.get("validated_articles", [])
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

        if not articles:
            # Both regex and LLM fallback yielded nothing — fail loudly instead of
            # silently completing with 0 articles (which produces a meaningless 0% comparison).
            doc.articles_status = "failed"
            doc.articles_error = (
                "No articles/sections could be extracted from this document. "
                "It may be scanned/image-only, empty, or in an unsupported format."
            )
            await db.commit()
            logger.warning("save_to_db: 0 articles extracted for %s — marked failed", doc_id)
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
