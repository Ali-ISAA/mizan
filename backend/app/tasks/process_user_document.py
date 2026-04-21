"""Process user-uploaded documents through Noesia and store chunks."""
import asyncio
import os
import uuid

from app.db.models.document import MizanDocument
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.session import WorkerAsyncSessionLocal
from app.services.noesia import noesia_client
from app.worker import celery_app
import logging

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=2)
def process_user_document_task(self, document_id: str, file_path: str):
    """
    Process user document: upload to Noesia → ingest → fetch chunks → store in DB.

    Args:
        document_id: UUID of MizanDocument
        file_path: Path to uploaded file
    """
    try:
        asyncio.run(_process_document(document_id, file_path))
    except Exception as e:
        logger.error(f"Error processing document {document_id}: {e}")
        raise


async def _process_document(document_id: str, file_path: str):
    """Async document processing pipeline."""
    async with WorkerAsyncSessionLocal() as db:
        doc = await db.get(MizanDocument, uuid.UUID(document_id))
        if not doc:
            logger.error(f"Document {document_id} not found")
            return

        try:
            # Update status to processing
            doc.processing_status = "processing"
            await db.commit()

            # Reconstruct filename with UUID for Noesia (matches superadmin pattern)
            stem, ext = os.path.splitext(doc.name)
            noesia_filename = f"{stem}_{str(doc.id).replace('-', '')}{ext}"

            # Upload to Noesia
            logger.info(f"Uploading {noesia_filename} to Noesia")
            upload_result = await noesia_client.upload_document(file_path, noesia_filename)

            # Create ingest job and wait for completion
            logger.info(f"Creating ingest job for {noesia_filename}")
            ingest_job = await noesia_client.create_ingest_job(noesia_filename)
            doc.noesia_document_id = ingest_job.get("document_id")

            # Poll for completion
            await noesia_client.wait_for_ingest_completion(noesia_filename)

            # Fetch chunks from Noesia
            logger.info(f"Fetching chunks for {noesia_filename}")
            chunks_response = await noesia_client.get_chunks(noesia_filename)
            chunks = chunks_response.get("chunks", [])

            # Save chunks to database
            for idx, chunk in enumerate(chunks):
                chunk_obj = MizanDocumentChunk(
                    mizan_document_id=doc.id,
                    chunk_index=idx,
                    text=chunk.get("text", ""),
                    section_header=chunk.get("metadata", {}).get("section_header"),
                    section_level=chunk.get("metadata", {}).get("section_level"),
                    document_name=chunk.get("metadata", {}).get("document_name", doc.name),
                    chunk_metadata=chunk.get("metadata", {}),
                )
                db.add(chunk_obj)

            doc.noesia_chunk_count = len(chunks)
            doc.processing_status = "completed"
            await db.commit()
            logger.info(f"Successfully processed {document_id} with {len(chunks)} chunks")

        except Exception as e:
            doc.processing_status = "failed"
            await db.commit()
            logger.error(f"Failed to process document {document_id}: {e}")
            raise
