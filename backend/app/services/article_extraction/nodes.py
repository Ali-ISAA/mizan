"""
LangGraph node functions for the article extraction agent.

Graph: fetch_markdown → regex_extract → save_to_db

Each node is an async function (state: ExtractionState) -> dict.
It returns only the keys it writes to state.
"""
from __future__ import annotations

import logging

from app.services.article_extraction.state import ExtractionState
from app.services.article_extraction.regex_extractor import extract_articles as regex_extract_articles
from app.services.noesia import NoesiaClient, NoesiaError

logger = logging.getLogger(__name__)


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
