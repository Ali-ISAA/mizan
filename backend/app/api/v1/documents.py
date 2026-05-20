"""Document upload and management."""
import hashlib
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.config import settings
from app.db.models.document import MizanDocument
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.models.mizan_document_article import MizanDocumentArticle
from app.db.models.user import User
from app.db.session import get_db
from app.tasks.process_user_document import process_user_document_task
from app.tasks.extract_articles import extract_articles_task
from app.services.comparison import ComparisonService
from app.services.audit import log_event
from app.db.models.compliance_finding import ComplianceFinding
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.compliance_report import ComplianceReport

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentOut(BaseModel):
    id: str
    role: str
    name: str
    file_type: str | None
    file_size: int | None
    processing_status: str
    noesia_chunk_count: int | None
    ai_summary: str | None
    page_count: int | None
    word_count: int | None
    created_at: datetime
    compliance_score: int | None = None
    issues_found: int | None = None
    latest_comparison_id: str | None = None
    latest_comparison_status: str | None = None
    articles_status: str | None = None
    articles_error: str | None = None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[DocumentOut])
async def list_documents(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    """List all documents with latest compliance data for the current user's tenant."""
    docs_result = await db.execute(
        select(MizanDocument).where(
            MizanDocument.tenant_id == user.tenant_id,
            MizanDocument.deleted_at.is_(None),
        )
    )
    docs = docs_result.scalars().all()

    if not docs:
        return []

    doc_ids = [d.id for d in docs]

    # Subquery: latest comparison (any status) per document by created_at
    latest_subq = (
        select(
            ComplianceComparison.mizan_document_id.label("doc_id"),
            func.max(ComplianceComparison.created_at).label("max_ts"),
        )
        .where(ComplianceComparison.mizan_document_id.in_(doc_ids))
        .group_by(ComplianceComparison.mizan_document_id)
        .subquery()
    )

    comp_rows = await db.execute(
        select(ComplianceComparison, ComplianceReport)
        .join(
            latest_subq,
            and_(
                ComplianceComparison.mizan_document_id == latest_subq.c.doc_id,
                ComplianceComparison.created_at == latest_subq.c.max_ts,
            ),
        )
        .outerjoin(ComplianceReport, ComplianceReport.comparison_id == ComplianceComparison.id)
    )

    comp_map: dict = {}
    for comparison, report in comp_rows:
        comp_map[comparison.mizan_document_id] = (comparison, report)

    return [
        DocumentOut(
            id=str(d.id),
            role=d.role,
            name=d.name,
            file_type=d.file_type,
            file_size=d.file_size,
            processing_status=d.processing_status,
            noesia_chunk_count=d.noesia_chunk_count,
            ai_summary=d.ai_summary,
            page_count=d.page_count,
            word_count=d.word_count,
            created_at=d.created_at,
            compliance_score=(comp_map[d.id][1].compliance_score if d.id in comp_map and comp_map[d.id][1] else None),
            issues_found=(comp_map[d.id][1].total_findings if d.id in comp_map and comp_map[d.id][1] else None),
            latest_comparison_id=(str(comp_map[d.id][0].id) if d.id in comp_map else None),
            latest_comparison_status=(comp_map[d.id][0].status if d.id in comp_map else None),
            articles_status=d.articles_status,
            articles_error=d.articles_error,
        )
        for d in docs
    ]


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch a single document by ID."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.tenant_id != user.tenant_id or doc.deleted_at:
        raise HTTPException(status_code=404, detail="Document not found")

    return DocumentOut(
        id=str(doc.id),
        role=doc.role,
        name=doc.name,
        file_type=doc.file_type,
        file_size=doc.file_size,
        processing_status=doc.processing_status,
        noesia_chunk_count=doc.noesia_chunk_count,
        ai_summary=doc.ai_summary,
        page_count=doc.page_count,
        word_count=doc.word_count,
        created_at=doc.created_at,
        articles_status=doc.articles_status,
        articles_error=doc.articles_error,
    )


@router.post("/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    base_document_id: str = Form(...),
    doc_type: str = Form(...),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a user document for comparison against a base document."""
    try:
        base_doc_uuid = uuid.UUID(base_document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid base_document_id")

    from app.db.models.base_document import BaseDocument
    base_doc = await db.get(BaseDocument, base_doc_uuid)
    if not base_doc:
        raise HTTPException(status_code=404, detail="Base document not found")

    content = await file.read()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_file_size_mb}MB limit")

    doc_id = uuid.uuid4()
    ext = os.path.splitext(file.filename or "")[1].lower()
    save_name = f"{doc_id}{ext}"
    save_path = os.path.join(settings.upload_dir, save_name)
    os.makedirs(settings.upload_dir, exist_ok=True)

    with open(save_path, "wb") as f:
        f.write(content)

    doc = MizanDocument(
        id=doc_id,
        tenant_id=user.tenant_id,
        created_by=user.id,
        role="compliance",
        name=file.filename or "document",
        file_type=ext.lstrip(".") or None,
        file_size=len(content),
        file_url=save_path,
        processing_status="pending",
        base_document_id=base_doc_uuid,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    await log_event(
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="document_uploaded",
        severity="success",
        title="Document uploaded",
        description=f"{doc.name} was uploaded and queued for processing",
        resource_type="document",
        resource_id=str(doc.id),
        actor_email=user.email,
    )

    process_user_document_task.delay(str(doc.id), save_path)

    return {
        "id": str(doc.id),
        "name": doc.name,
        "file_size": doc.file_size,
        "processing_status": doc.processing_status,
        "base_document_id": str(doc.base_document_id),
    }


@router.get("/{document_id}/chunks")
async def get_document_chunks(
    document_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch chunks for a document."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.processing_status != "completed":
        raise HTTPException(status_code=400, detail=f"Document not ready (status: {doc.processing_status})")

    result = await db.execute(
        select(MizanDocumentChunk)
        .where(MizanDocumentChunk.mizan_document_id == doc_uuid)
        .order_by(MizanDocumentChunk.chunk_index)
    )
    chunks = result.scalars().all()

    chunk_dicts = [
        {
            "id": str(c.id),
            "text": c.text,
            "metadata": {
                "section_header": c.section_header,
                "section_level": c.section_level,
                "chunk_index": c.chunk_index,
                "document_name": c.document_name,
            },
        }
        for c in chunks
    ]

    return {"chunks": chunk_dicts, "total": len(chunk_dicts)}


@router.delete("", status_code=204)
async def delete_all_documents(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete all documents for the current tenant."""
    docs_result = await db.execute(
        select(MizanDocument).where(
            MizanDocument.tenant_id == user.tenant_id,
            MizanDocument.deleted_at.is_(None),
        )
    )
    docs = docs_result.scalars().all()
    now = datetime.utcnow()
    for doc in docs:
        doc.deleted_at = now
    await db.commit()
    return None


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete a document (mark as deleted)."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.deleted_at = datetime.utcnow()
    await db.commit()

    return None


@router.post("/{doc_id}/analyze", response_model=dict)
async def start_comparison(
    doc_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger comparison of a document against its base document.

    Returns: {"comparison_id": "...", "status": "pending"}
    """
    try:
        doc_uuid = uuid.UUID(doc_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    # Verify document exists and belongs to user's tenant
    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")

    # Guard: both documents must have articles extracted
    if doc.articles_status != "completed":
        raise HTTPException(
            status_code=400,
            detail="Your document's articles have not been extracted yet. Please wait for article extraction to complete before running analysis.",
        )

    from app.db.models.base_document import BaseDocument
    base_doc = await db.get(BaseDocument, doc.base_document_id)
    if not base_doc or base_doc.articles_status != "completed":
        raise HTTPException(
            status_code=400,
            detail="The regulation document's articles have not been extracted yet. Please contact your administrator.",
        )

    try:
        service = ComparisonService()
        comparison = await service.start_comparison(
            tenant_id=user.tenant_id,
            mizan_doc_id=doc_uuid,
            db=db
        )
        await log_event(
            tenant_id=user.tenant_id,
            user_id=user.id,
            action="analysis_started",
            severity="info",
            title="Compliance analysis started",
            description=f"Analysis started for {doc.name}",
            resource_type="comparison",
            resource_id=str(comparison.id),
            actor_email=user.email,
        )
        return {
            "comparison_id": str(comparison.id),
            "status": comparison.status,
            "created_at": comparison.created_at.isoformat()
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to start comparison")


@router.post("/{doc_id}/retry", response_model=dict)
async def retry_document_processing(
    doc_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-queue a failed document for processing."""
    try:
        doc_uuid = uuid.UUID(doc_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.processing_status != "failed":
        raise HTTPException(status_code=400, detail=f"Document is not in failed state (status: {doc.processing_status})")

    if not doc.file_url or not os.path.exists(doc.file_url):
        raise HTTPException(status_code=400, detail="Original file no longer available — please delete and re-upload")

    doc.processing_status = "pending"
    doc.noesia_document_id = None
    doc.noesia_chunk_count = 0
    await db.commit()

    process_user_document_task.delay(str(doc.id), doc.file_url)

    return {"id": str(doc.id), "status": "pending"}


@router.get("/{document_id}/content")
async def get_document_content(
    document_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the complete document markdown from Noesia."""
    from app.services.noesia import noesia_client, NoesiaError

    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.tenant_id != user.tenant_id or doc.deleted_at:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.noesia_document_id:
        raise HTTPException(status_code=404, detail="Document not yet ingested into Noesia")

    try:
        content = await noesia_client.get_document_content(doc.noesia_document_id)
        return {"content": content}
    except NoesiaError as e:
        raise HTTPException(status_code=502, detail=f"Noesia error {e.status_code}: {e.detail[:200]}")


@router.get("/{document_id}/articles")
async def get_document_articles(
    document_id: str,
    limit: int = 2000,
    offset: int = 0,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Return extracted articles for a document."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.tenant_id != user.tenant_id or doc.deleted_at:
        raise HTTPException(status_code=404, detail="Document not found")

    stmt = (
        select(MizanDocumentArticle)
        .where(MizanDocumentArticle.mizan_document_id == doc_uuid)
        .order_by(text(
            "CAST((regexp_match(article_number, '^\\d+\\.?\\d*'))[1] AS FLOAT) NULLS LAST, article_number"
        ))
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    articles = result.scalars().all()

    total = await db.scalar(
        select(func.count(MizanDocumentArticle.id)).where(MizanDocumentArticle.mizan_document_id == doc_uuid)
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


@router.post("/{document_id}/extract-articles")
async def trigger_article_extraction(
    document_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger article extraction for a document."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.tenant_id != user.tenant_id or doc.deleted_at:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.processing_status != "completed":
        raise HTTPException(status_code=400, detail="Document must finish processing before article extraction")

    doc.articles_status = "pending"
    doc.articles_error = None
    await db.commit()

    extract_articles_task.delay(str(doc.id), "user")

    return {"articles_status": "pending", "message": "Extraction queued"}


@router.get("/comparisons/{comparison_id}/status", response_model=dict)
async def get_comparison_status(
    comparison_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll for comparison status with progress details."""
    try:
        comp_uuid = uuid.UUID(comparison_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid comparison_id")

    try:
        service = ComparisonService()
        status = await service.get_comparison_status(comp_uuid, db)
        return status
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to get comparison status")


@router.get("/comparisons/{comparison_id}/report", response_model=dict)
async def get_comparison_report(
    comparison_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch completed comparison report with findings."""
    try:
        comp_uuid = uuid.UUID(comparison_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid comparison_id")

    try:
        service = ComparisonService()
        report = await service.get_comparison_report(comp_uuid, db)

        # Get findings too
        findings_stmt = select(ComplianceFinding).where(
            ComplianceFinding.comparison_id == comp_uuid
        )
        findings_result = await db.execute(findings_stmt)
        findings = findings_result.scalars().all()

        return {
            "report": {
                "id": str(report.id),
                "compliance_score": report.compliance_score,
                "total_findings": report.total_findings,
                "critical_count": report.critical_count,
                "medium_count": report.medium_count,
                "low_count": report.low_count,
                "summary": report.summary
            },
            "findings": [
                {
                    "id": str(f.id),
                    "doc_a_section": f.doc_a_section,
                    "doc_b_section": f.doc_b_section,
                    "status": f.status,
                    "severity": f.severity,
                    "issue": f.issue,
                    "recommendation": f.recommendation
                }
                for f in findings
            ]
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to get comparison report")


@router.get("/comparisons/{comparison_id}/narrative", response_model=dict)
async def get_comparison_narrative(
    comparison_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI executive summary and risk assessment for a completed comparison."""
    try:
        comp_uuid = uuid.UUID(comparison_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid comparison_id")

    comparison = await db.get(ComplianceComparison, comp_uuid)
    if not comparison or comparison.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Comparison not found")
    if comparison.status != "completed":
        raise HTTPException(status_code=400, detail="Comparison not yet completed")

    report_result = await db.execute(
        select(ComplianceReport).where(ComplianceReport.comparison_id == comp_uuid)
    )
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    findings_result = await db.execute(
        select(ComplianceFinding).where(ComplianceFinding.comparison_id == comp_uuid)
    )
    findings = findings_result.scalars().all()

    # Resolve doc and regulation names
    doc = await db.get(MizanDocument, comparison.mizan_document_id)
    from app.db.models.base_document import BaseDocument
    base_doc = await db.get(BaseDocument, comparison.base_document_id)

    from app.services.compliance_comparator import ComplianceComparator
    comparator = ComplianceComparator()
    narrative = await comparator.generate_report_narrative(
        doc_name=doc.name if doc else "Compliance Document",
        regulation_name=base_doc.filename if base_doc else "Regulation",
        score=report.compliance_score,
        critical_count=report.critical_count,
        medium_count=report.medium_count,
        low_count=report.low_count,
        findings=[
            {
                "status": f.status,
                "doc_a_section": f.doc_a_section,
                "issue": f.issue,
                "recommendation": f.recommendation,
            }
            for f in findings
        ],
    )

    return narrative
