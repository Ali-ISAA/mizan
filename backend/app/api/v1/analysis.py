"""Analysis endpoints: trigger, results, gaps, mappings."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.db.models.analysis import AnalysisResult, ComplianceMapping, GapItem, RequirementItem
from app.db.models.document import MizanDocument
from app.db.models.project import Project
from app.db.models.user import User
from app.db.session import get_db
from app.tasks.analysis import run_analysis_task

router = APIRouter(prefix="/projects/{project_id}", tags=["analysis"])


async def _get_project(project_id: str, user: User, db: AsyncSession) -> Project:
    project = await db.get(Project, uuid.UUID(project_id))
    if not project or project.tenant_id != user.tenant_id or project.deleted_at:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/analyze", status_code=202)
async def trigger_analysis(project_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    project = await _get_project(project_id, user, db)

    # Verify both docs are processed
    result = await db.execute(
        select(MizanDocument).where(
            MizanDocument.tenant_id == user.tenant_id,
            MizanDocument.deleted_at.is_(None),
        )
    )
    docs = result.scalars().all()
    doc_a = next((d for d in docs if d.role == "requirement"), None)
    doc_b = next((d for d in docs if d.role == "compliance"), None)

    if not doc_a:
        raise HTTPException(status_code=400, detail="Requirements document not uploaded")
    if not doc_b:
        raise HTTPException(status_code=400, detail="Compliance document not uploaded")
    if doc_a.processing_status != "completed":
        raise HTTPException(status_code=400, detail=f"Requirements document is still {doc_a.processing_status}")
    if doc_b.processing_status != "completed":
        raise HTTPException(status_code=400, detail=f"Compliance document is still {doc_b.processing_status}")

    project.status = "processing"
    await db.commit()

    run_analysis_task.delay(project_id)
    return {"message": "Analysis started", "project_id": project_id}


class AnalysisOut(BaseModel):
    id: str
    overall_score: float | None
    requirements_count: int
    met_count: int
    partial_count: int
    not_met_count: int
    critical_gaps: int
    major_gaps: int
    minor_gaps: int
    executive_summary: str | None
    analyzed_at: datetime


class RequirementOut(BaseModel):
    id: str
    requirement_text: str
    section_ref: str | None
    compliance_status: str
    confidence_score: float | None
    order_index: int
    mapping: dict | None = None


class GapOut(BaseModel):
    id: str
    gap_description: str
    severity: str
    recommendation: str | None
    order_index: int


@router.get("/analysis", response_model=AnalysisOut)
async def get_analysis(project_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    project = await _get_project(project_id, user, db)
    result = await db.execute(select(AnalysisResult).where(AnalysisResult.project_id == project.id))
    ar = result.scalar_one_or_none()
    if not ar:
        raise HTTPException(status_code=404, detail="Analysis not found — run /analyze first")
    return AnalysisOut(id=str(ar.id), overall_score=ar.overall_score, requirements_count=ar.requirements_count, met_count=ar.met_count, partial_count=ar.partial_count, not_met_count=ar.not_met_count, critical_gaps=ar.critical_gaps, major_gaps=ar.major_gaps, minor_gaps=ar.minor_gaps, executive_summary=ar.executive_summary, analyzed_at=ar.analyzed_at)


@router.get("/requirements", response_model=list[RequirementOut])
async def get_requirements(project_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    project = await _get_project(project_id, user, db)
    result = await db.execute(select(AnalysisResult).where(AnalysisResult.project_id == project.id))
    ar = result.scalar_one_or_none()
    if not ar:
        raise HTTPException(status_code=404, detail="Analysis not found")

    req_result = await db.execute(
        select(RequirementItem).where(RequirementItem.analysis_result_id == ar.id).order_by(RequirementItem.order_index)
    )
    requirements = req_result.scalars().all()

    out = []
    for req in requirements:
        mapping_result = await db.execute(select(ComplianceMapping).where(ComplianceMapping.requirement_id == req.id).limit(1))
        mapping = mapping_result.scalar_one_or_none()
        mapping_dict = None
        if mapping:
            mapping_dict = {"matched_clause_text": mapping.matched_clause_text, "doc_b_section_ref": mapping.doc_b_section_ref, "match_score": mapping.match_score, "ai_commentary": mapping.ai_commentary}
        out.append(RequirementOut(id=str(req.id), requirement_text=req.requirement_text, section_ref=req.section_ref, compliance_status=req.compliance_status, confidence_score=req.confidence_score, order_index=req.order_index, mapping=mapping_dict))
    return out


@router.get("/gaps", response_model=list[GapOut])
async def get_gaps(project_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    project = await _get_project(project_id, user, db)
    result = await db.execute(select(AnalysisResult).where(AnalysisResult.project_id == project.id))
    ar = result.scalar_one_or_none()
    if not ar:
        raise HTTPException(status_code=404, detail="Analysis not found")
    gap_result = await db.execute(select(GapItem).where(GapItem.analysis_result_id == ar.id).order_by(GapItem.order_index))
    gaps = gap_result.scalars().all()
    return [GapOut(id=str(g.id), gap_description=g.gap_description, severity=g.severity, recommendation=g.recommendation, order_index=g.order_index) for g in gaps]
