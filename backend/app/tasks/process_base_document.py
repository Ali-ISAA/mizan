"""Process a base document through Noesia ingest pipeline."""
import asyncio
import logging
import mimetypes
import os
import uuid

from app.db.models.base_document import BaseDocument
from app.db.models.base_document_chunk import BaseDocumentChunk
from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
from app.services.noesia import NoesiaError, noesia_client
from app.tasks.extract_articles import extract_articles_task
from app.worker import celery_app

logger = logging.getLogger(__name__)

COLLECTION_NAME = "mizan_base_documents"


async def _process_base_document(doc_id: str, file_path: str) -> None:
    """Async processing pipeline for base documents."""
    try:
        doc_uuid = uuid.UUID(doc_id)
    except ValueError:
        logger.error("_process_base_document: invalid UUID — doc_id=%s", doc_id)
        return

    async with AsyncSessionLocal() as db:
        try:
            # Get initial document
            doc = await db.get(BaseDocument, doc_uuid)
            if not doc:
                logger.warning("BaseDocument %s not found", doc_id)
                return

            doc.processing_status = "processing"
            await db.commit()

            noesia_doc_id = None

            # Step 1: Upload to Noesia (skip if already uploaded in a previous attempt)
            if doc.noesia_document_id:
                noesia_doc_id = doc.noesia_document_id
                logger.info("Skipping upload — already have noesia_document_id=%s", noesia_doc_id)
            else:
                try:
                    content = await asyncio.to_thread(lambda: open(file_path, "rb").read())
                    content_type = mimetypes.guess_type(doc.filename)[0] or "application/octet-stream"
                    upload_results = await noesia_client.upload_documents([
                        (doc.filename, content, content_type, str(doc.id), doc.filename)
                    ])
                    noesia_doc_id = upload_results[0][0]
                    doc.noesia_document_id = noesia_doc_id
                    await db.commit()
                    logger.info("Uploaded %s → noesia_id=%s", doc.filename, noesia_doc_id)
                except NoesiaError as e:
                    if e.status_code == 409:
                        # File already exists in Noesia — this is OK, continue processing
                        # We'll use the filename for chunk retrieval instead
                        logger.warning("File %s already exists in Noesia (409), continuing with ingest", doc.filename)
                        # Generate a placeholder noesia_doc_id (we won't actually use it)
                        noesia_doc_id = str(uuid.uuid4())
                    else:
                        raise

            # Step 2: Ingest — create job and wait for completion
            ingest_result = await noesia_client.ingest_documents(
                document_pairs=[(noesia_doc_id, str(doc.id))],
                collection_name=COLLECTION_NAME,
                project_id=f"base_{str(doc.id)[:8]}",
                idempotency_key=f"base-{doc.id}",
            )
            job_id = ingest_result.job_id

            # Wait for job to complete
            for attempt in range(120):
                status = await noesia_client.get_job_status(job_id)
                if status.get("status") == "completed":
                    logger.info("Job %s completed", job_id)
                    break
                if status.get("status") == "failed":
                    raise RuntimeError(f"Noesia job failed: {status}")
                logger.info("Job %s status=%s, waiting...", job_id, status.get("status"))
                await asyncio.sleep(5)

            # Step 3: Store collection_id and fetch chunk count via Noesia chunks API
            collection_id = ingest_result.collection_id

            if collection_id:
                # Reconstruct the filename as it was uploaded to Noesia (with UUID suffix)
                stem, ext = os.path.splitext(doc.filename)
                noesia_filename = f"{stem}_{str(doc.id).replace('-', '')}{ext}"
                chunks = await noesia_client.get_chunks(
                    collection_id=collection_id,
                    document_name=noesia_filename,
                    limit=500,
                )
                chunk_count = len(chunks)

                # Save chunks to database
                for idx, chunk in enumerate(chunks):
                    db_chunk = BaseDocumentChunk(
                        base_document_id=doc_uuid,
                        chunk_index=idx,
                        text=chunk.get("text") or "",
                        section_header=chunk.get("metadata", {}).get("section_header"),
                        section_level=chunk.get("metadata", {}).get("section_level"),
                        document_name=noesia_filename,
                    )
                    db.add(db_chunk)
            else:
                logger.warning("No collection_id returned from ingest for doc %s", doc_id)
                chunk_count = 0

            doc.processing_status = "completed"
            doc.noesia_collection_id = collection_id
            doc.chunk_count = chunk_count
            await db.commit()
            logger.info("Completed processing for %s: %d chunks", doc_id, chunk_count)

            # Queue article extraction now that chunks are in DB — non-fatal if this fails
            try:
                doc.articles_status = "pending"
                await db.commit()
                extract_articles_task.delay(str(doc.id), "base")
                logger.info("Queued article extraction for %s", doc_id)
            except Exception as trigger_err:
                logger.warning("Failed to queue article extraction for %s: %s", doc_id, trigger_err)

        except Exception as e:
            logger.exception("Failed to process base document %s: %s", doc_id, e)
            doc = await db.get(BaseDocument, doc_uuid)
            if doc:
                doc.processing_status = "failed"
                await db.commit()
        finally:
            try:
                os.remove(file_path)
            except OSError:
                pass


@celery_app.task(name="tasks.process_base_document")
def process_base_document_task(doc_id: str, file_path: str) -> None:
    asyncio.run(_process_base_document(doc_id, file_path))
