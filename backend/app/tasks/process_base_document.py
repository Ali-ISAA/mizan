"""Process a base document through Noesia ingest pipeline."""
import asyncio
import logging
import mimetypes
import os
import uuid

from app.db.models.base_document import BaseDocument
from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
from app.services.noesia import NoesiaError, noesia_client
from app.worker import celery_app

logger = logging.getLogger(__name__)

COLLECTION_NAME = "mizan_base_documents"


async def _process_base_document(doc_id: str, file_path: str) -> None:
    doc_uuid = uuid.UUID(doc_id)

    async def get_doc() -> BaseDocument | None:
        async with AsyncSessionLocal() as db:
            doc = await db.get(BaseDocument, doc_uuid)
            return doc

    async def set_status(status: str, **updates) -> None:
        async with AsyncSessionLocal() as db:
            doc = await db.get(BaseDocument, doc_uuid)
            if doc:
                doc.processing_status = status
                for key, value in updates.items():
                    setattr(doc, key, value)
                await db.commit()

    # Get initial document
    doc = await get_doc()
    if not doc:
        logger.warning("BaseDocument %s not found", doc_id)
        return

    # Mark as processing
    await set_status("processing")

    try:
        # Step 1: Upload to Noesia (skip if already uploaded in a previous attempt)
        doc = await get_doc()
        if doc.noesia_document_id:
            noesia_doc_id = doc.noesia_document_id
            logger.info("Skipping upload — already have noesia_document_id=%s", noesia_doc_id)
        else:
            with open(file_path, "rb") as f:
                content = f.read()
            content_type = mimetypes.guess_type(doc.filename)[0] or "application/octet-stream"
            try:
                upload_results = await noesia_client.upload_documents([
                    (doc.filename, content, content_type, str(doc.id), doc.filename)
                ])
                noesia_doc_id = upload_results[0][0]
            except NoesiaError as e:
                if e.status_code == 409:
                    raise RuntimeError(
                        f"File already exists in Noesia (409). Delete this document and re-upload: {e.detail}"
                    ) from e
                raise
            await set_status("processing", noesia_document_id=noesia_doc_id)

        # Step 2: Ingest — create job and wait for completion
        ingest_result = await noesia_client.ingest_documents(
            document_pairs=[(noesia_doc_id, str(doc.id))],
            collection_name=COLLECTION_NAME,
            project_id=f"base_{str(doc.id)[:8]}",
            idempotency_key=f"base-{doc.id}",
        )
        job_id = ingest_result.job_id

        # Wait for job to actually complete (ingest_documents may return before job finishes)
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
            doc = await get_doc()
            stem, ext = os.path.splitext(doc.filename)
            noesia_filename = f"{stem}_{str(doc.id).replace('-', '')}{ext}"
            chunks = await noesia_client.get_chunks(
                collection_id=collection_id,
                document_name=noesia_filename,
                limit=500,
            )
            chunk_count = len(chunks)
        else:
            logger.warning("No collection_id returned from ingest for doc %s", doc_id)
            chunk_count = 0

        await set_status("completed", noesia_collection_id=collection_id, chunk_count=chunk_count)

    except Exception as e:
        logger.exception("Failed to process base document %s: %s", doc_id, e)
        await set_status("failed")
    finally:
        try:
            os.remove(file_path)
        except OSError:
            pass


@celery_app.task(name="tasks.process_base_document")
def process_base_document_task(doc_id: str, file_path: str) -> None:
    asyncio.run(_process_base_document(doc_id, file_path))
