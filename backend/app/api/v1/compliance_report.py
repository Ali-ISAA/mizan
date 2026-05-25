"""Compliance Report API — regulation-first analysis endpoint."""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.db.models.base_document import BaseDocument
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.document import MizanDocument
from app.db.models.user import User
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["compliance-report"])


@router.post("/documents/{doc_id}/compliance-report")
async def generate_compliance_report(
    doc_id: str,
    current_user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Queue a comprehensive regulation-first compliance analysis.

    Creates a ComplianceComparison job and enqueues a Celery task.
    Poll /documents/comparisons/{comparison_id}/status for progress.
    Retrieve results from /documents/comparisons/{comparison_id}/report.
    """
    try:
        doc_uuid = uuid.UUID(doc_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")

    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.tenant_id != current_user.tenant_id or doc.deleted_at:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.articles_status != "completed":
        raise HTTPException(status_code=400, detail="Document articles must be extracted first")

    if not doc.base_document_id:
        raise HTTPException(status_code=400, detail="Document has no regulation assigned")

    base_doc = await db.get(BaseDocument, doc.base_document_id)
    if not base_doc:
        raise HTTPException(status_code=404, detail="Regulation document not found")

    if base_doc.articles_status != "completed":
        raise HTTPException(status_code=400, detail="Regulation articles must be extracted first")

    # Create comparison job
    comparison = ComplianceComparison(
        tenant_id=current_user.tenant_id,
        mizan_document_id=doc.id,
        base_document_id=base_doc.id,
        status="pending",
    )
    db.add(comparison)
    await db.commit()
    await db.refresh(comparison)

    # Queue the Celery task
    from app.tasks.compliance_report_task import generate_compliance_report_task
    generate_compliance_report_task.delay(str(comparison.id))

    logger.info(
        "Queued compliance report: doc=%s ('%s') vs regulation=%s ('%s') → comparison=%s",
        doc_uuid, doc.name, base_doc.id, base_doc.filename, comparison.id,
    )

    return {
        "comparison_id": str(comparison.id),
        "status": "pending",
        "message": f"Analysis queued. Poll /api/v1/documents/comparisons/{comparison.id}/status for progress.",
    }
