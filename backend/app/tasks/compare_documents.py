"""Celery task to orchestrate document comparison pipeline.

Flow:
  1. Fetch MizanDocument and BaseDocument
  2. Run compliance analysis
  3. Create ComplianceReport with findings
  4. Update ComplianceComparison status
"""
import asyncio
import logging
import uuid
from datetime import datetime

from sqlalchemy.future import select

from app.db.models.document import MizanDocument
from app.db.models.base_document import BaseDocument
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.compliance_report import ComplianceReport
from app.db.models.mizan_document_article import MizanDocumentArticle
from app.db.models.base_document_article import BaseDocumentArticle
from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
from app.services.audit import log_event
from app.services.compliance_comparator import ComplianceComparator
from app.worker import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="app.tasks.compare_documents.compare_documents_task")
def compare_documents_task(self, mizan_doc_id: str, base_doc_id: str, comparison_id: str):
    """
    Orchestrate comparison of two documents.

    Args:
        mizan_doc_id: UUID of MizanDocument (compliance doc)
        base_doc_id: UUID of BaseDocument (requirement doc)
        comparison_id: UUID of ComplianceComparison job
    """
    try:
        mizan_uuid = uuid.UUID(mizan_doc_id)
        base_uuid = uuid.UUID(base_doc_id)
        comparison_uuid = uuid.UUID(comparison_id)
    except ValueError:
        logger.error("Invalid UUID: mizan_doc_id=%s base_doc_id=%s comparison_id=%s", mizan_doc_id, base_doc_id, comparison_id)
        return

    asyncio.run(_compare_documents_impl(mizan_uuid, base_uuid, comparison_uuid))


async def _compare_documents_impl(mizan_doc_id: uuid.UUID, base_doc_id: uuid.UUID, comparison_id: uuid.UUID) -> None:
    """Implementation of comparison pipeline."""
    async with AsyncSessionLocal() as db:
        try:
            # Update comparison status to "processing"
            comparison = await db.get(ComplianceComparison, comparison_id)
            if not comparison:
                logger.warning("ComplianceComparison %s not found", comparison_id)
                return

            comparison.status = "processing"
            comparison.started_at = datetime.utcnow()
            await db.commit()

            # Fetch MizanDocument (Doc B - compliance doc)
            mizan_doc = await db.get(MizanDocument, mizan_doc_id)
            if not mizan_doc:
                logger.warning("MizanDocument %s not found", mizan_doc_id)
                comparison.status = "failed"
                comparison.error_message = f"MizanDocument {mizan_doc_id} not found"
                await db.commit()
                return

            # Fetch BaseDocument (Doc A - requirement doc)
            base_doc = await db.get(BaseDocument, base_doc_id)
            if not base_doc:
                logger.warning("BaseDocument %s not found", base_doc_id)
                comparison.status = "failed"
                comparison.error_message = f"BaseDocument {base_doc_id} not found"
                await db.commit()
                return

            logger.info("Starting comparison: mizan_doc=%s base_doc=%s", mizan_doc_id, base_doc_id)

            # Fetch articles for both documents
            result_base = await db.execute(
                select(BaseDocumentArticle)
                .where(BaseDocumentArticle.base_document_id == base_doc_id)
                .order_by(BaseDocumentArticle.article_index)
            )
            base_articles = result_base.scalars().all()

            result_mizan = await db.execute(
                select(MizanDocumentArticle)
                .where(MizanDocumentArticle.mizan_document_id == mizan_doc_id)
                .order_by(MizanDocumentArticle.article_index)
            )
            mizan_articles = result_mizan.scalars().all()

            if not base_articles or not mizan_articles:
                logger.warning("Missing articles: base=%d mizan=%d", len(base_articles), len(mizan_articles))
                comparison.status = "failed"
                comparison.error_message = (
                    f"Missing articles: base={len(base_articles)} mizan={len(mizan_articles)}. "
                    "Ensure article extraction has completed for both documents."
                )
                await db.commit()
                return

            # One LLM call per compliance (policy) section — compliance-doc-driven
            # We ask: "Is each policy section accurate per the regulation?"
            # This reflects real-world compliance: the policy is assessed against the law,
            # not the other way around.
            total_sections = len(mizan_articles)
            comparison.total_chunks = total_sections
            comparison.current_chunk = 0
            await db.commit()
            logger.info(f"Starting compliance-driven comparison: {total_sections} policy sections vs {len(base_articles)} regulation articles")

            comparator = ComplianceComparator()
            regulation_text = comparator.prepare_regulation_articles(base_articles)

            all_findings = []
            for i, mizan_article in enumerate(mizan_articles):
                article_index = i + 1
                logger.info(f"Processing policy section {article_index}/{total_sections}: {mizan_article.article_number}")
                finding = await comparator.compare_compliance_section(mizan_article, article_index, regulation_text)
                if finding:
                    all_findings.append(finding)
                comparison.current_chunk = article_index
                await db.commit()

            report, findings = comparator._compile_report(all_findings)

            # Save report
            report.comparison_id = comparison_id
            db.add(report)
            await db.flush()

            # Save findings
            for finding in findings:
                finding.comparison_id = comparison_id
                db.add(finding)

            # Update comparison
            comparison.status = "completed"
            comparison.completed_at = datetime.utcnow()
            await db.commit()

            logger.info(f"Comparison {comparison_id} completed: Score={report.compliance_score}")

            await log_event(
                tenant_id=comparison.tenant_id,
                action="analysis_completed",
                severity="success" if report.compliance_score >= 80 else "warning",
                title="Compliance analysis completed",
                description=(
                    f"Analysis finished with score {report.compliance_score}% "
                    f"({report.total_findings} findings)"
                ),
                resource_type="comparison",
                resource_id=str(comparison_id),
            )

        except Exception as e:
            logger.exception("Error in comparison pipeline: %s", str(e))
            try:
                await db.rollback()
                comparison = await db.get(ComplianceComparison, comparison_id)
                if comparison:
                    comparison.status = "failed"
                    comparison.error_message = str(e)[:1000]
                    comparison.completed_at = datetime.utcnow()
                    await db.commit()

                    await log_event(
                        tenant_id=comparison.tenant_id,
                        action="analysis_failed",
                        severity="error",
                        title="Compliance analysis failed",
                        description=str(e)[:200],
                        resource_type="comparison",
                        resource_id=str(comparison_id),
                    )
            except Exception as db_error:
                logger.exception("Error updating comparison status: %s", str(db_error))
