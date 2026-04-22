"""Process user-uploaded documents through Noesia and store chunks."""
import asyncio
import mimetypes
import os
import uuid

from app.db.models.document import MizanDocument
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.session import WorkerAsyncSessionLocal
from app.services.noesia import noesia_client, NoesiaError
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
        doc_uuid = uuid.UUID(document_id)
        doc = await db.get(MizanDocument, doc_uuid)
        if not doc:
            logger.error(f"Document {document_id} not found")
            return

        try:
            # Update status to processing
            doc.processing_status = "processing"
            await db.commit()

            # Read file content
            content = await asyncio.to_thread(lambda: open(file_path, "rb").read())
            content_type = mimetypes.guess_type(doc.name)[0] or "application/octet-stream"

            # Upload to Noesia
            logger.info(f"Uploading {doc.name} to Noesia")
            pairs = await noesia_client.upload_documents([
                (doc.name, content, content_type, str(doc.id), doc.name)
            ])

            if not pairs:
                raise Exception("Failed to upload document to Noesia")

            noesia_document_id, _ = pairs[0]

            # Create ingest job with unique collection name per document
            collection_name = f"user_doc_{uuid.uuid4().hex[:8]}"
            logger.info(f"Creating ingest job for {doc.name}")
            ingest_result = await noesia_client.ingest_documents(
                document_pairs=pairs,
                collection_name=collection_name,
                project_id=str(doc.base_document_id or uuid.uuid4()),
                idempotency_key=uuid.uuid4().hex,
            )

            doc.noesia_document_id = noesia_document_id

            # Fetch chunks from job details
            logger.info(f"Extracting chunks for {doc.name}")
            job_docs = ingest_result.job_detail.get("documents") or []
            job_doc_meta = next(
                (d for d in job_docs if d.get("document_id") == noesia_document_id),
                job_docs[0] if job_docs else None,
            )

            chunks = []
            if job_doc_meta:
                # Extract chunks from job metadata
                doc_chunks = job_doc_meta.get("extracted_chunks", [])
                for idx, chunk_data in enumerate(doc_chunks):
                    chunk_obj = MizanDocumentChunk(
                        mizan_document_id=doc.id,
                        chunk_index=idx,
                        text=chunk_data.get("text", ""),
                        section_header=chunk_data.get("metadata", {}).get("section_header"),
                        section_level=chunk_data.get("metadata", {}).get("section_level"),
                        document_name=chunk_data.get("metadata", {}).get("document_name", doc.name),
                        chunk_metadata=chunk_data.get("metadata", {}),
                    )
                    db.add(chunk_obj)
                    chunks.append(chunk_obj)

            doc.noesia_chunk_count = len(chunks)
            doc.processing_status = "completed"
            await db.commit()
            logger.info(f"Successfully processed {document_id} with {len(chunks)} chunks")

        except NoesiaError as e:
            logger.error(f"Noesia API error processing {document_id}: {e}")
            doc.processing_status = "failed"
            await db.commit()
            raise
        except Exception as e:
            logger.error(f"Error processing document {document_id}: {e}", exc_info=True)
            doc.processing_status = "failed"
            await db.commit()
            raise
