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
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.models.base_document_chunk import BaseDocumentChunk
from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
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

            # Fetch chunks for both documents
            stmt_mizan = select(MizanDocumentChunk).where(
                MizanDocumentChunk.mizan_document_id == mizan_doc_id
            ).order_by(MizanDocumentChunk.chunk_index)
            result_mizan = await db.execute(stmt_mizan)
            doc_a_chunks = result_mizan.scalars().all()

            stmt_base = select(BaseDocumentChunk).where(
                BaseDocumentChunk.base_document_id == base_doc_id
            ).order_by(BaseDocumentChunk.chunk_index)
            result_base = await db.execute(stmt_base)
            doc_b_chunks = result_base.scalars().all()

            if not doc_a_chunks or not doc_b_chunks:
                logger.warning("Missing chunks: doc_a=%d doc_b=%d", len(doc_a_chunks), len(doc_b_chunks))
                comparison.status = "failed"
                comparison.error_message = f"Missing chunks: doc_a={len(doc_a_chunks)} doc_b={len(doc_b_chunks)}"
                await db.commit()
                return

            # Calculate total chunks to process
            total_chunks = len(doc_a_chunks) + len(doc_b_chunks)
            comparison.total_chunks = total_chunks
            comparison.current_chunk = 0
            await db.commit()
            logger.info(f"Starting comparison: total_chunks={total_chunks}")

            # Run comparison
            comparator = ComplianceComparator()
            report, findings = await comparator.compare(doc_a_chunks, doc_b_chunks)

            # Update progress: mark as complete
            comparison.current_chunk = total_chunks

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

        except Exception as e:
            logger.exception("Error in comparison pipeline: %s", str(e))
            try:
                comparison = await db.get(ComplianceComparison, comparison_id)
                if comparison:
                    comparison.status = "failed"
                    comparison.error_message = str(e)
                    comparison.completed_at = datetime.utcnow()
                    await db.commit()
            except Exception as db_error:
                logger.exception("Error updating comparison status: %s", str(db_error))
