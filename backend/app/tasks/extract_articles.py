"""Extract numbered articles from documents using Noesia markdown content or chunk fallback."""
import asyncio
import json
import logging
import re
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

# LLM fallback settings (used only when chunks lack section_header metadata)
BATCH_SIZE = 15
OVERLAP = 2

LLM_SYSTEM_PROMPT = (
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

# Lines that are pure PDF extraction artifacts — strip them from all article text
_NOISE_LINE = re.compile(
    r"^\s*(?:line chart|logo|<!--\s*image\s*-->|<!--\s*figure\s*-->|<!--.*?-->)\s*$",
    re.IGNORECASE,
)

# Arabic-Indic digit translation table
_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def _clean_text(text: str) -> str:
    """Remove PDF image/chart placeholder lines; collapse excess blank lines."""
    lines = text.splitlines()
    cleaned = [ln for ln in lines if not _NOISE_LINE.match(ln)]
    result = "\n".join(cleaned)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


def _fix_mojibake(s: str) -> str:
    """
    Noesia's /content API double-encodes UTF-8 Arabic text as Latin-1.
    Re-encode to Latin-1 bytes then decode as UTF-8 to recover original Unicode.
    """
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def _parse_heading_articles(markdown: str) -> list[dict]:
    """
    Extract articles from heading-based documents (laws, regulations).

    Detects lines that are entirely: [optional ##] + keyword + number + [optional colon]
    Keywords: Article, Section, Clause, Provision, Regulation, and Arabic equivalents.
    Numbers: any Unicode decimal digit (Western, Arabic-Indic) + optional . - /
    Works with or without parentheses and with or without ## prefix.
    """
    _ARTICLE_HEADER = re.compile(
        r"^(?:##\s+)?"
        r"(?:Article|Section|Clause|Provision|Regulation"
        r"|مادة|باب|فصل|بند)\s*"
        r"[\(\[]?\d[\d\.\-/]*[\)\]]?"
        r"\s*:?\s*$",
        re.IGNORECASE | re.UNICODE,
    )

    lines = markdown.split("\n")
    articles: list[dict] = []
    current_number: str | None = None
    current_lines: list[str] = []

    def _save_current() -> None:
        if current_number is not None:
            text = _clean_text("\n".join(current_lines))
            if text:
                articles.append({"article_number": current_number, "article_text": text})

    for line in lines:
        stripped = line.strip()
        fixed = _fix_mojibake(stripped)

        if _ARTICLE_HEADER.match(fixed):
            _save_current()
            label = re.sub(r"^##\s+", "", fixed).rstrip(": ").strip()
            current_number = label
            current_lines = []
        elif stripped.startswith("## "):
            _save_current()
            current_number = None
            current_lines = []
        elif current_number is not None:
            current_lines.append(line)

    _save_current()
    return articles


def _parse_table_controls(markdown: str) -> list[dict]:
    """
    Extract controls from table-based documents (standards/frameworks like ECC, ISO 27001).

    These documents store controls in markdown tables:
        | 1-1     | Subdomain name              |
        | 1-1-1   | Control requirement text... |
        | 1-1-2   | Another control...          |

    Rules:
    - First column must be a hierarchical number (digits separated by hyphens: 1-1, 1-1-1)
    - Second column is the control text
    - Skip separator rows (|---|), label rows (| Objective |, | Controls |)
    - Skip rows where the text cell is itself just a sub-item number reference
    - First occurrence of each control number wins (deduplicates repeated rows)
    """
    _CONTROL_ROW = re.compile(r"^\|\s*(\d+(?:-\d+)+)\s*\|(.+)")
    _IS_SUBITEM_REF = re.compile(r"^\d+(?:-\d+)+\s*$")

    articles: list[dict] = []
    seen: set[str] = set()

    for line in markdown.split("\n"):
        fixed = _fix_mojibake(line.strip())
        if not fixed.startswith("|"):
            continue
        m = _CONTROL_ROW.match(fixed)
        if not m:
            continue
        num = m.group(1).strip()
        text = m.group(2).strip().rstrip("|").strip()

        if not text or text.startswith("---") or text in {"Objective", "Controls"}:
            continue
        if _IS_SUBITEM_REF.match(text):
            continue
        if num in seen:
            continue
        seen.add(num)

        text = _clean_text(text)
        if text:
            articles.append({"article_number": num, "article_text": text})

    return articles


def _parse_markdown_articles(markdown: str) -> list[dict]:
    """
    Universal extraction from Noesia's full markdown content. Tries two strategies:

    1. Heading-based (laws/regulations): '## Article (١):' or plain 'Article 1:'
    2. Table-based (standards/frameworks): '| 1-1-1 | Control text |' rows

    Returns the first strategy that produces results. Falls back to empty list if
    neither matches — the caller then uses chunk-based or LLM extraction.
    """
    articles = _parse_heading_articles(markdown)
    if articles:
        return articles
    return _parse_table_controls(markdown)


def _extract_from_headers(chunks: list) -> list[dict]:
    """
    Fallback extraction: use section_header chunk metadata as the article number.
    Groups multiple chunks sharing the same header (concatenates their text).
    Preserves document order (chunk_index order).
    Skips chunks without a section_header.
    """
    groups: dict[str, list[str]] = {}
    order: list[str] = []

    for chunk in chunks:
        header = (chunk.section_header or "").strip()
        if not header:
            continue
        if header not in groups:
            groups[header] = []
            order.append(header)
        text = _clean_text(chunk.text or "")
        if text:
            groups[header].append(text)

    articles = []
    for header in order:
        texts = groups[header]
        article_text = "\n\n".join(texts)
        if article_text:
            articles.append({"article_number": header, "article_text": article_text})

    return articles


def _build_batches(chunks: list, batch_size: int = BATCH_SIZE, overlap: int = OVERLAP) -> list[list]:
    """Slide a window of batch_size chunks with overlap between batches."""
    if not chunks:
        return []
    batches = []
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


async def _extract_with_llm(chunks: list, document_id: str) -> list[dict]:
    """Fallback: extract articles via LLM when section_header metadata is absent."""
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
                    {"role": "system", "content": LLM_SYSTEM_PROMPT},
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

    return _deduplicate_articles(all_articles)


async def _extract_articles(document_id: str, document_type: str) -> None:
    """
    Core async extraction pipeline.
    document_type: "base" | "user"

    Strategy (in order of preference):
    1. Noesia /content markdown — full document, clean article boundaries (fastest, most accurate)
    2. section_header chunk metadata — instant but may miss articles without headers
    3. LLM batch extraction — slowest, used only when chunks have no section_header metadata
    """
    doc_uuid = UUID(document_id)

    async with AsyncSessionLocal() as db:
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
            articles: list[dict] = []

            # Strategy 1: Noesia full-document markdown (most accurate)
            noesia_doc_id = getattr(doc, "noesia_document_id", None)
            if noesia_doc_id:
                try:
                    from app.services.noesia import noesia_client, NoesiaError
                    logger.info("Doc %s: fetching full markdown from Noesia (doc_id=%s)", document_id, noesia_doc_id)
                    markdown = await noesia_client.get_document_content(noesia_doc_id)
                    articles = _parse_markdown_articles(markdown)
                    logger.info(
                        "Doc %s: markdown strategy found %d articles", document_id, len(articles)
                    )
                except Exception as e:
                    logger.warning("Doc %s: markdown extraction failed (%s), falling back to chunks", document_id, e)
                    articles = []

            # Strategy 2: section_header chunk metadata (fallback)
            if not articles:
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
                    logger.warning("No chunks found for document %s", document_id)
                    doc.articles_status = "failed"
                    doc.articles_error = "No chunks available for extraction"
                    await db.commit()
                    return

                headers_present = sum(1 for c in chunks if (c.section_header or "").strip())
                if headers_present > 0:
                    logger.info(
                        "Doc %s: using section_header strategy (%d/%d chunks have headers)",
                        document_id, headers_present, len(chunks),
                    )
                    articles = _extract_from_headers(chunks)
                else:
                    # Strategy 3: LLM (last resort)
                    logger.info("Doc %s: no section headers found, falling back to LLM", document_id)
                    articles = await _extract_with_llm(chunks, document_id)

            # Delete existing rows, bulk-insert new ones (idempotent)
            if document_type == "base":
                await db.execute(
                    delete(BaseDocumentArticle).where(BaseDocumentArticle.base_document_id == doc_uuid)
                )
                for idx, item in enumerate(articles):
                    db.add(BaseDocumentArticle(
                        base_document_id=doc_uuid,
                        article_index=idx,
                        article_number=item["article_number"],
                        article_text=item["article_text"],
                    ))
            else:
                await db.execute(
                    delete(MizanDocumentArticle).where(MizanDocumentArticle.mizan_document_id == doc_uuid)
                )
                for idx, item in enumerate(articles):
                    db.add(MizanDocumentArticle(
                        mizan_document_id=doc_uuid,
                        article_index=idx,
                        article_number=item["article_number"],
                        article_text=item["article_text"],
                    ))

            doc.articles_status = "completed"
            await db.commit()
            logger.info("Article extraction complete for %s: %d articles", document_id, len(articles))

        except Exception as e:
            logger.exception("Article extraction failed for %s: %s", document_id, e)
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
