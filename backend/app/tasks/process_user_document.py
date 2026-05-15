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

            # Upload to Noesia (skip if already uploaded)
            if doc.noesia_document_id:
                logger.info(f"Document {doc.name} already uploaded to Noesia (id={doc.noesia_document_id})")
                noesia_document_id = doc.noesia_document_id
            else:
                logger.info(f"Uploading {doc.name} to Noesia")
                try:
                    pairs = await noesia_client.upload_documents([
                        (doc.name, content, content_type, str(doc.id), doc.name)
                    ])

                    if not pairs:
                        raise Exception("Failed to upload document to Noesia")

                    noesia_document_id, _ = pairs[0]
                    doc.noesia_document_id = noesia_document_id
                    await db.commit()
                    logger.info(f"Uploaded {doc.name} → noesia_id={noesia_document_id}")
                except NoesiaError as e:
                    if e.status_code == 409:
                        # File already exists in Noesia — this is OK, continue processing
                        # We'll use the filename for chunk retrieval instead
                        logger.warning(f"File {doc.name} already exists in Noesia (409), continuing with ingest")
                        # Generate a placeholder noesia_document_id (we won't actually use it for chunks)
                        noesia_document_id = str(uuid.uuid4())
                    else:
                        raise

            # Create ingest job with unique collection name per document
            collection_name = f"user_doc_{uuid.uuid4().hex[:8]}"
            logger.info(f"Creating ingest job for {doc.name}")
            ingest_result = await noesia_client.ingest_documents(
                document_pairs=[(noesia_document_id, str(doc.id))],
                collection_name=collection_name,
                project_id=str(doc.base_document_id or uuid.uuid4()),
                idempotency_key=f"user-{doc.id}",
            )

            # Wait for job to complete before fetching chunks
            job_id = ingest_result.job_id
            for attempt in range(120):
                status = await noesia_client.get_job_status(job_id)
                if status.get("status") == "completed":
                    logger.info(f"Job {job_id} completed")
                    break
                if status.get("status") == "failed":
                    raise RuntimeError(f"Noesia job failed: {status}")
                logger.info(f"Job {job_id} status={status.get('status')}, waiting...")
                await asyncio.sleep(5)

            # Get collection_id and fetch chunks via Noesia chunks API
            collection_id = ingest_result.collection_id
            chunks = []

            if collection_id:
                # Reconstruct filename as it was uploaded to Noesia (with UUID suffix)
                stem, ext = os.path.splitext(doc.name)
                noesia_filename = f"{stem}_{str(doc.id).replace('-', '')}{ext}"

                logger.info(f"Fetching chunks for {doc.name} from collection {collection_id}")
                chunks_response = await noesia_client.get_chunks(
                    collection_id=collection_id,
                    document_name=noesia_filename,
                    limit=500,
                )

                # Save chunks to database
                for idx, chunk_data in enumerate(chunks_response):
                    chunk_obj = MizanDocumentChunk(
                        mizan_document_id=doc.id,
                        chunk_index=idx,
                        text=chunk_data.get("text", ""),
                        section_header=chunk_data.get("metadata", {}).get("section_header"),
                        section_level=chunk_data.get("metadata", {}).get("section_level"),
                        document_name=noesia_filename,
                        chunk_metadata=chunk_data.get("metadata", {}),
                    )
                    db.add(chunk_obj)
                    chunks.append(chunk_obj)
            else:
                logger.warning(f"No collection_id returned from ingest for doc {document_id}")

            doc.noesia_chunk_count = len(chunks)
            doc.processing_status = "completed"
            doc.articles_status = "pending"
            await db.commit()
            logger.info(f"Successfully processed {document_id} with {len(chunks)} chunks")

            from app.tasks.extract_articles import extract_articles_task
            extract_articles_task.delay(document_id, "user")

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
