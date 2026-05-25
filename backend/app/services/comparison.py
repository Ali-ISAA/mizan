import logging
import uuid as uuid_module
from datetime import datetime, timedelta
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.models.document import MizanDocument
from app.db.models.base_document import BaseDocument
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.compliance_report import ComplianceReport
from app.db.models.compliance_finding import ComplianceFinding
from app.tasks.compliance_report_task import generate_compliance_report_task

logger = logging.getLogger(__name__)


class ComparisonService:
    """Orchestrates document comparison pipeline."""

    async def start_comparison(self, tenant_id: UUID, mizan_doc_id: UUID, db: AsyncSession = None) -> ComplianceComparison:
        """
        Create comparison job and enqueue Celery task.

        Args:
            tenant_id: Tenant UUID
            mizan_doc_id: MizanDocument UUID to compare
            db: AsyncSession (optional, uses provided session)

        Returns:
            ComplianceComparison record with status="pending"
        """
        try:
            # Get the MizanDocument
            stmt = select(MizanDocument).where(MizanDocument.id == mizan_doc_id)
            result = await db.execute(stmt)
            mizan_doc = result.scalar_one_or_none()

            if not mizan_doc:
                raise ValueError(f"MizanDocument {mizan_doc_id} not found")

            # Get the base_document_id from MizanDocument
            base_doc_id = mizan_doc.base_document_id
            if not base_doc_id:
                raise ValueError(f"MizanDocument {mizan_doc_id} has no base_document_id assigned")

            # Create ComplianceComparison record
            comparison = ComplianceComparison(
                id=uuid_module.uuid4(),
                tenant_id=tenant_id,
                mizan_document_id=mizan_doc_id,
                base_document_id=base_doc_id,
                status="pending"
            )
            db.add(comparison)
            await db.commit()
            await db.refresh(comparison)

            logger.info(f"Created ComplianceComparison {comparison.id} for MizanDocument {mizan_doc_id}")

            # Enqueue regulation-first compliance report task
            generate_compliance_report_task.delay(str(comparison.id))

            return comparison

        except Exception as e:
            logger.error(f"Error in start_comparison: {e}")
            raise

    async def get_comparison_status(self, comparison_id: UUID, db: AsyncSession = None) -> dict:
        """
        Get current status for polling with progress details.

        Returns: {"status": "pending|processing|completed|failed", "started_at": ..., "completed_at": ..., "current_chunk": ..., "total_chunks": ..., "estimated_completion": ...}
        """
        try:
            stmt = select(ComplianceComparison).where(ComplianceComparison.id == comparison_id)
            result = await db.execute(stmt)
            comparison = result.scalar_one_or_none()

            if not comparison:
                raise ValueError(f"ComplianceComparison {comparison_id} not found")

            response = {
                "status": comparison.status,
                "current_chunk": comparison.current_chunk,
                "total_chunks": comparison.total_chunks,
                # Append Z so JavaScript treats these as UTC, not local time
                "started_at": comparison.started_at.isoformat() + "Z" if comparison.started_at else None,
                "completed_at": comparison.completed_at.isoformat() + "Z" if comparison.completed_at else None,
                "error_message": comparison.error_message,
                "estimated_completion": None,
            }

            # Calculate estimated completion if processing
            if comparison.status == "processing" and comparison.total_chunks > 0 and comparison.started_at:
                elapsed_seconds = (datetime.utcnow() - comparison.started_at).total_seconds()
                if elapsed_seconds > 0 and comparison.current_chunk > 0:
                    chunk_rate = comparison.current_chunk / elapsed_seconds
                    remaining_chunks = comparison.total_chunks - comparison.current_chunk
                    estimated_remaining_seconds = remaining_chunks / chunk_rate
                    estimated_completion = datetime.utcnow() + timedelta(seconds=estimated_remaining_seconds)
                    response["estimated_completion"] = estimated_completion.isoformat() + "Z"

            return response

        except Exception as e:
            logger.error(f"Error in get_comparison_status: {e}")
            raise

    async def get_comparison_report(self, comparison_id: UUID, db: AsyncSession = None) -> ComplianceReport:
        """Fetch completed report with all findings."""
        try:
            stmt = select(ComplianceReport).where(ComplianceReport.comparison_id == comparison_id)
            result = await db.execute(stmt)
            report = result.scalar_one_or_none()

            if not report:
                raise ValueError(f"ComplianceReport not found for comparison {comparison_id}")

            return report

        except Exception as e:
            logger.error(f"Error in get_comparison_report: {e}")
            raise
