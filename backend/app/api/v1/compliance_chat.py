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
            "name": "mizan_list_documents",
            "description": "List all policy documents available in this account. Use this when the user asks what documents exist, what files are available, or wants to see document names.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
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
    "mizan_list_documents": "Listing documents…",
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
    elif doc:
        # Auto-resolve the latest completed comparison for this document
        cmp_result = await db.execute(
            select(ComplianceComparison)
            .where(
                ComplianceComparison.mizan_document_id == doc.id,
                ComplianceComparison.status == "completed",
                ComplianceComparison.tenant_id == user.tenant_id,
            )
            .order_by(ComplianceComparison.created_at.desc())
            .limit(1)
        )
        comparison = cmp_result.scalar_one_or_none()
        if comparison:
            rpt_result = await db.execute(
                select(ComplianceReport).where(ComplianceReport.comparison_id == comparison.id)
            )
            report = rpt_result.scalar_one_or_none()

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
        filters: dict = {}
        if comparison and comparison.base_document_id:
            filters["object_id"] = str(comparison.base_document_id)
        results = await qdrant_search.search(
            BASE_DOC_COLLECTION, query, top_k=5, metadata_filters=filters or None
        )

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


async def _tool_list_documents(args: dict, user: User, db: AsyncSession) -> str:
    stmt = (
        select(MizanDocument)
        .where(MizanDocument.tenant_id == user.tenant_id)
        .order_by(MizanDocument.created_at.desc())
        .limit(50)
    )
    docs = (await db.execute(stmt)).scalars().all()
    return json.dumps({
        "total": len(docs),
        "documents": [
            {
                "id": str(d.id),
                "name": d.name,
                "file_type": d.file_type,
                "processing_status": d.processing_status,
            }
            for d in docs
        ],
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
        if tool_name == "mizan_list_documents":
            return await _tool_list_documents(tool_args, user, db)
        elif tool_name == "mizan_search":
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
                break
        else:
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
