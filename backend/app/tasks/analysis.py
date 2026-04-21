"""Compliance analysis pipeline.

Triggered after both documents in a project are processed.
Flow:
  1. Load both documents from DB, verify they are processed
  2. Get Doc A text (requirements)
  3. Run compliance analysis against Doc B's Noesia collection
  4. Persist AnalysisResult, RequirementItems, ComplianceMappings, GapItems
  5. Update project overall_score and status
  6. Generate executive summary
"""
import asyncio
import logging
import uuid

from app.db.models.analysis import AnalysisResult, ComplianceMapping, GapItem, RequirementItem

from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
from app.services import compliance as compliance_service
from app.services.llm import generate_executive_summary
from app.worker import celery_app
from sqlalchemy import select, delete

logger = logging.getLogger(__name__)


async def _run_analysis(project_id: str) -> None:
    try:
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        logger.error("Invalid project_id: %s", project_id)
        return

    async with AsyncSessionLocal() as db:
        try:
            project = await db.get(Project, project_uuid)
            if not project:
                logger.warning("Project %s not found", project_id)
                return

            project.status = "processing"
            await db.commit()

            # Load both documents
            from app.db.models.document import MizanDocument
            from sqlalchemy import select
            result = await db.execute(
                select(MizanDocument).where(
                    MizanDocument.project_id == project_uuid,
                    MizanDocument.deleted_at.is_(None),
                )
            )
            docs = result.scalars().all()

            doc_a = next((d for d in docs if d.role == "requirement"), None)
            doc_b = next((d for d in docs if d.role == "compliance"), None)

            if not doc_a or not doc_b:
                logger.error("Project %s missing requirement or compliance doc", project_id)
                project.status = "failed"
                await db.commit()
                return

            if doc_a.processing_status != "completed" or doc_b.processing_status != "completed":
                logger.error("Project %s docs not fully processed (a=%s b=%s)", project_id, doc_a.processing_status, doc_b.processing_status)
                project.status = "failed"
                await db.commit()
                return

            doc_a_text = doc_a.text_output or ""
            if not doc_a_text:
                logger.error("Doc A (%s) has no text content", doc_a.id)
                project.status = "failed"
                await db.commit()
                return

            collection_name = project.noesia_collection_name
            if not collection_name:
                logger.error("Project %s has no noesia_collection_name", project_id)
                project.status = "failed"
                await db.commit()
                return

            # Run compliance analysis
            logger.info("Starting compliance analysis for project %s", project_id)
            analysis = await compliance_service.analyze_compliance(
                doc_a_text=doc_a_text,
                doc_a_name=doc_a.name,
                collection_name=collection_name,
            )

            # Delete existing analysis result for this project (re-run support)
            await db.execute(delete(AnalysisResult).where(AnalysisResult.project_id == project_uuid))
            await db.flush()

            # Persist AnalysisResult
            ar = AnalysisResult(
                project_id=project_uuid,
                tenant_id=project.tenant_id,
                overall_score=analysis.overall_score,
                requirements_count=len(analysis.requirements),
                met_count=analysis.met_count,
                partial_count=analysis.partial_count,
                not_met_count=analysis.not_met_count,
                critical_gaps=analysis.critical_gaps,
                major_gaps=analysis.major_gaps,
                minor_gaps=analysis.minor_gaps,
            )
            db.add(ar)
            await db.flush()

            # Persist RequirementItems + ComplianceMappings
            req_id_map: dict[int, uuid.UUID] = {}
            for req in analysis.requirements:
                ri = RequirementItem(
                    analysis_result_id=ar.id,
                    project_id=project_uuid,
                    tenant_id=project.tenant_id,
                    requirement_text=req.requirement_text,
                    section_ref=req.section_ref,
                    compliance_status=req.compliance_status,
                    confidence_score=req.confidence_score,
                    order_index=req.order_index,
                )
                db.add(ri)
                await db.flush()
                req_id_map[req.order_index] = ri.id

                if req.matched_clause_text:
                    cm = ComplianceMapping(
                        requirement_id=ri.id,
                        project_id=project_uuid,
                        matched_clause_text=req.matched_clause_text,
                        doc_b_section_ref=req.doc_b_section_ref,
                        match_score=req.match_score,
                        ai_commentary=req.ai_commentary,
                    )
                    db.add(cm)

            # Persist GapItems
            for gap in analysis.gaps:
                req_db_id = req_id_map.get(gap.requirement_index)
                gi = GapItem(
                    analysis_result_id=ar.id,
                    requirement_id=req_db_id,
                    project_id=project_uuid,
                    tenant_id=project.tenant_id,
                    gap_description=gap.gap_description,
                    severity=gap.severity,
                    recommendation=gap.recommendation,
                    order_index=gap.order_index,
                )
                db.add(gi)

            await db.flush()

            # Generate executive summary
            exec_summary = await generate_executive_summary(
                overall_score=analysis.overall_score,
                met=analysis.met_count,
                partial=analysis.partial_count,
                not_met=analysis.not_met_count,
                critical_gaps=analysis.critical_gaps,
                doc_a_name=doc_a.name,
                doc_b_name=doc_b.name,
            )
            ar.executive_summary = exec_summary

            # Update project
            project.overall_score = analysis.overall_score
            project.requirements_count = len(analysis.requirements)
            project.met_count = analysis.met_count
            project.partial_count = analysis.partial_count
            project.not_met_count = analysis.not_met_count
            project.status = "complete"

            await db.commit()
            logger.info("Analysis completed for project %s: score=%.1f%%", project_id, analysis.overall_score)

        except Exception:
            logger.exception("Analysis pipeline failed for project %s", project_id)
            async with AsyncSessionLocal() as db2:
                try:
                    p = await db2.get(Project, project_uuid)
                    if p:
                        p.status = "failed"
                        await db2.commit()
                except Exception as inner:
                    logger.error("Failed to mark project %s as failed: %s", project_id, inner)


@celery_app.task(name="tasks.run_analysis")
def run_analysis_task(project_id: str) -> None:
    asyncio.run(_run_analysis(project_id))
