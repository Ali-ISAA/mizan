"""Report generation and download."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.db.models.analysis import AnalysisResult, GapItem, RequirementItem

from app.db.models.user import User
from app.db.session import get_db
from app.services.report import generate_json_report, generate_pdf_report

router = APIRouter(prefix="/projects/{project_id}/report", tags=["reports"])


async def _get_project(project_id: str, user: User, db: AsyncSession) -> Project:
    project = await db.get(Project, uuid.UUID(project_id))
    if not project or project.tenant_id != user.tenant_id or project.deleted_at:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("")
async def download_report(
    project_id: str,
    format: str = Query("json", pattern="^(json|pdf)$"),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project(project_id, user, db)
    if project.status != "complete":
        raise HTTPException(status_code=400, detail="Analysis not complete")

    result = await db.execute(select(AnalysisResult).where(AnalysisResult.project_id == project.id))
    ar = result.scalar_one_or_none()
    if not ar:
        raise HTTPException(status_code=404, detail="Analysis not found")

    req_result = await db.execute(select(RequirementItem).where(RequirementItem.analysis_result_id == ar.id).order_by(RequirementItem.order_index))
    requirements = [{"requirement_text": r.requirement_text, "section_ref": r.section_ref, "compliance_status": r.compliance_status, "confidence_score": r.confidence_score} for r in req_result.scalars().all()]

    gap_result = await db.execute(select(GapItem).where(GapItem.analysis_result_id == ar.id).order_by(GapItem.order_index))
    gaps = [{"gap_description": g.gap_description, "severity": g.severity, "recommendation": g.recommendation} for g in gap_result.scalars().all()]

    project_data = {"id": str(project.id), "name": project.name, "description": project.description}
    analysis_data = {"overall_score": ar.overall_score, "requirements_count": ar.requirements_count, "met_count": ar.met_count, "partial_count": ar.partial_count, "not_met_count": ar.not_met_count, "critical_gaps": ar.critical_gaps, "major_gaps": ar.major_gaps, "minor_gaps": ar.minor_gaps, "executive_summary": ar.executive_summary}

    filename = f"mizan-compliance-{project.name[:30].replace(' ', '-')}"

    if format == "pdf":
        content = generate_pdf_report(project_data, analysis_data, requirements, gaps)
        return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'})
    else:
        content = generate_json_report(project_data, analysis_data, requirements, gaps)
        return Response(content=content, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{filename}.json"'})
