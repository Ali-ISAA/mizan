"""Document processing pipeline: Noesia ingest → AI summary.

Flow per document:
  1. Upload file to Noesia → get noesia_document_id
  2. Create ingest job → poll until completed
  3. Fetch document metadata (classification, text)
  4. Generate AI summary
"""
import asyncio
import logging
import mimetypes
import os
import uuid
from datetime import datetime, timezone

from slugify import slugify

from app.db.models.document import MizanDocument
from app.db.models.project import Project
from app.db.session import WorkerAsyncSessionLocal as AsyncSessionLocal
from app.services.llm import generate_summary
from app.services.noesia import IngestResult, NoesiaError, noesia_client
from app.services.qdrant_search import scroll_chunks_by_doc_id, scroll_chunks_by_noesia_id
from app.worker import celery_app

logger = logging.getLogger(__name__)


async def _process_document(doc_id: str, file_path: str, project_id: str) -> None:
    try:
        doc_uuid = uuid.UUID(doc_id)
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        logger.error("Invalid UUID: doc_id=%s project_id=%s", doc_id, project_id)
        return

    async with AsyncSessionLocal() as db:
        try:
            doc = await db.get(MizanDocument, doc_uuid)
            if not doc:
                logger.warning("Document %s not found", doc_id)
                return

            doc.processing_status = "processing"
            await db.commit()

            project = await db.get(Project, project_uuid)
            ingest_result: IngestResult | None = None
            ingest_failed = False
            noesia_document_id: str | None = None

            # Ensure project has a noesia collection name
            if project and not project.noesia_collection_name:
                project.noesia_collection_name = f"mizan_{slugify(project.name)}_{uuid.uuid4().hex[:8]}"
                await db.flush()

            if project and project.noesia_collection_name:
                try:
                    display_filename = doc.name
                    if display_filename and not os.path.splitext(display_filename)[1]:
                        path_ext = os.path.splitext(file_path)[1]
                        if path_ext:
                            display_filename += path_ext
                    content_type = mimetypes.guess_type(display_filename)[0] or "application/octet-stream"
                    content = await asyncio.to_thread(lambda: open(file_path, "rb").read())

                    pairs = await noesia_client.upload_documents([
                        (display_filename, content, content_type, doc_id, doc.name)
                    ])
                    ingest_result = await noesia_client.ingest_documents(
                        document_pairs=pairs,
                        collection_name=project.noesia_collection_name,
                        project_id=project_id,
                        idempotency_key=uuid.uuid4().hex,
                    )
                    noesia_document_id = next(iter(ingest_result.document_map), None)
                    doc.noesia_document_id = noesia_document_id or ingest_result.job_id
                    doc.indexed_at = datetime.now(timezone.utc).replace(tzinfo=None)

                    if ingest_result.collection_id and not project.noesia_collection_id:
                        project.noesia_collection_id = ingest_result.collection_id

                    logger.info("Ingest completed for %s → noesia_id=%s", doc_id, noesia_document_id)
                except (NoesiaError, Exception):
                    logger.exception("Noesia ingest failed for %s", doc_id)
                    ingest_failed = True

            await db.flush()

            # Fetch classification + text
            if noesia_document_id:
                job_detail = ingest_result.job_detail if ingest_result else {}
                job_docs = job_detail.get("documents") or []
                job_doc_meta = next(
                    (d for d in job_docs if d.get("document_id") == noesia_document_id),
                    job_docs[0] if job_docs else None,
                )
                if job_doc_meta:
                    doc.classification = {
                        "document_type": job_doc_meta.get("document_type"),
                        "document_tags": job_doc_meta.get("document_tags") or [],
                    }
                    doc.file_properties = job_doc_meta.get("file_metadata") or {}

                try:
                    noesia_doc = await noesia_client.get_document(noesia_document_id)
                    preview = noesia_doc.get("preview_text") or ""
                    doc.text_output = preview
                    doc.page_count = noesia_doc.get("page_count")
                    doc.word_count = noesia_doc.get("word_count")
                except NoesiaError as e:
                    if e.status_code == 403 and project and project.noesia_collection_name:
                        chunks = await scroll_chunks_by_doc_id(project.noesia_collection_name, doc_id)
                        if not chunks:
                            chunks = await scroll_chunks_by_noesia_id(project.noesia_collection_name, noesia_document_id)
                        doc.text_output = "\n\n".join(c.get("text", "") for c in chunks if c.get("text"))
                    else:
                        logger.exception("Noesia document fetch failed for %s", doc_id)
                except Exception:
                    logger.exception("Noesia document fetch failed for %s", doc_id)

            # AI summary
            if doc.text_output:
                try:
                    summary = await generate_summary(doc.text_output, doc.name)
                    if summary:
                        doc.ai_summary = summary
                except Exception as exc:
                    logger.warning("AI summary failed for %s: %s", doc_id, exc)

            doc.processing_status = "failed" if ingest_failed else "completed"
            await db.commit()
            logger.info("Document %s processed successfully (status=%s)", doc_id, doc.processing_status)

        except Exception:
            logger.exception("Processing pipeline failed for %s", doc_id)
            async with AsyncSessionLocal() as db2:
                try:
                    doc2 = await db2.get(MizanDocument, doc_uuid)
                    if doc2:
                        doc2.processing_status = "failed"
                        await db2.commit()
                except Exception as inner:
                    logger.error("Failed to mark doc %s as failed: %s", doc_id, inner)


@celery_app.task(name="tasks.process_document")
def process_document_task(doc_id: str, file_path: str, project_id: str) -> None:
    asyncio.run(_process_document(doc_id, file_path, project_id))
