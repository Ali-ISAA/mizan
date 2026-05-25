"""Celery task for regulation-first compliance report generation."""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime

from app.db.models.compliance_comparison import ComplianceComparison
from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
from app.services.audit import log_event
from app.services.compliance_report_agent import ComplianceReportAgent
from app.worker import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="app.tasks.compliance_report_task.generate_compliance_report_task")
def generate_compliance_report_task(self, comparison_id: str) -> None:
    asyncio.run(_run(uuid.UUID(comparison_id)))


async def _run(comparison_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        comparison = await db.get(ComplianceComparison, comparison_id)
        if not comparison:
            logger.error("ComplianceComparison %s not found", comparison_id)
            return

        try:
            agent = ComplianceReportAgent()
            await agent.run(comparison_id=comparison_id, db=db)

            await log_event(
                tenant_id=comparison.tenant_id,
                action="analysis_completed",
                severity="success",
                title="Compliance report completed",
                description=f"Regulation-first analysis finished for comparison {comparison_id}",
                resource_type="comparison",
                resource_id=str(comparison_id),
            )
        except Exception as exc:
            logger.exception("ComplianceReportAgent failed for %s: %s", comparison_id, exc)
            try:
                await db.rollback()
                comparison = await db.get(ComplianceComparison, comparison_id)
                if comparison:
                    comparison.status = "failed"
                    comparison.error_message = str(exc)[:1000]
                    comparison.completed_at = datetime.utcnow()
                    await db.commit()
                    await log_event(
                        tenant_id=comparison.tenant_id,
                        action="analysis_failed",
                        severity="error",
                        title="Compliance report failed",
                        description=str(exc)[:200],
                        resource_type="comparison",
                        resource_id=str(comparison_id),
                    )
            except Exception as db_exc:
                logger.exception("Failed to update comparison status: %s", db_exc)
