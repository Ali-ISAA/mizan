"""Base document endpoints — superadmin upload/manage, users read."""
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.api.v1.superadmin import require_superadmin
from app.db.models.base_document import DOC_TYPES, BaseDocument
from app.db.session import get_db
from app.tasks.process_base_document import process_base_document_task

router = APIRouter(tags=["base-documents"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/tmp/mizan-uploads")


class BaseDocOut(BaseModel):
    id: str
    filename: str
    doc_type: str
    processing_status: str
    chunk_count: int
    file_size: int | None
    uploaded_by: str
    created_at: datetime


class BaseDocStats(BaseModel):
    total: int
    by_type: dict[str, int]
    by_status: dict[str, int]


# ── Superadmin endpoints ──────────────────────────────────────────────────────

@router.get("/superadmin/base-documents/stats", response_model=BaseDocStats)
async def get_stats(_=Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BaseDocument))
    docs = result.scalars().all()
    by_type: dict[str, int] = {}
    by_status: dict[str, int] = {}
    for d in docs:
        by_type[d.doc_type] = by_type.get(d.doc_type, 0) + 1
        by_status[d.processing_status] = by_status.get(d.processing_status, 0) + 1
    return BaseDocStats(total=len(docs), by_type=by_type, by_status=by_status)


@router.get("/superadmin/base-documents", response_model=list[BaseDocOut])
async def list_base_docs(
    doc_type: str | None = None,
    status: str | None = None,
    _=Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    q = select(BaseDocument).order_by(BaseDocument.created_at.desc())
    if doc_type:
        q = q.where(BaseDocument.doc_type == doc_type)
    if status:
        q = q.where(BaseDocument.processing_status == status)
    result = await db.execute(q)
    docs = result.scalars().all()
    return [_to_out(d) for d in docs]


@router.post("/superadmin/base-documents", response_model=BaseDocOut, status_code=201)
async def upload_base_doc(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    _=Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    if doc_type not in DOC_TYPES:
        raise HTTPException(status_code=422, detail=f"doc_type must be one of: {', '.join(DOC_TYPES)}")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    doc_id = uuid.uuid4()
    ext = os.path.splitext(file.filename or "upload")[1] or ".bin"
    file_path = os.path.join(UPLOAD_DIR, f"base_{doc_id}{ext}")

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    doc = BaseDocument(
        id=doc_id,
        filename=file.filename or f"document{ext}",
        doc_type=doc_type,
        file_path=file_path,
        file_size=len(content),
        processing_status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Kick off Celery task
    process_base_document_task.delay(str(doc.id), file_path)

    return _to_out(doc)


@router.get("/superadmin/base-documents/{doc_id}", response_model=BaseDocOut)
async def get_base_doc(doc_id: str, _=Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    doc = await db.get(BaseDocument, uuid.UUID(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return _to_out(doc)


@router.get("/superadmin/base-documents/{doc_id}/chunks")
async def get_chunks(
    doc_id: str,
    q: str | None = None,
    _=Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(BaseDocument, uuid.UUID(doc_id))
    if not doc or not doc.noesia_document_id:
        raise HTTPException(status_code=404, detail="Not found or not yet processed")
    if not doc.noesia_collection_id:
        raise HTTPException(status_code=404, detail="Document has no collection yet — still processing?")

    from app.services.noesia import noesia_client
    # Reconstruct the filename as it was uploaded to Noesia (with UUID suffix)
    stem, ext = os.path.splitext(doc.filename)
    noesia_filename = f"{stem}_{str(doc.id).replace('-', '')}{ext}"
    chunks = await noesia_client.get_chunks(
        collection_id=doc.noesia_collection_id,
        document_name=noesia_filename,
        limit=500,
    )

    if q:
        q_lower = q.lower()
        chunks = [c for c in chunks if q_lower in str(c.get("text", "")).lower()]

    return {"chunks": chunks, "total": len(chunks)}


@router.delete("/superadmin/base-documents/{doc_id}", status_code=204)
async def delete_base_doc(doc_id: str, _=Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    doc = await db.get(BaseDocument, uuid.UUID(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")

    # Clean up from Noesia so the filename slot is freed for re-uploads
    if doc.noesia_document_id:
        from app.services.noesia import noesia_client, NoesiaError
        try:
            await noesia_client.delete_document(doc.noesia_document_id)
        except NoesiaError as e:
            # Log but don't block deletion — Noesia doc may already be gone
            import logging
            logging.getLogger(__name__).warning(
                "Could not delete Noesia doc %s: %s", doc.noesia_document_id, e
            )

    await db.delete(doc)
    await db.commit()


# ── User-facing endpoint ──────────────────────────────────────────────────────

@router.get("/base-documents", response_model=list[BaseDocOut])
async def list_base_docs_for_users(
    doc_type: str | None = None,
    _=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Users fetch available base documents to compare against."""
    q = select(BaseDocument).where(
        BaseDocument.processing_status == "completed"
    ).order_by(BaseDocument.created_at.desc())
    if doc_type:
        q = q.where(BaseDocument.doc_type == doc_type)
    result = await db.execute(q)
    return [_to_out(d) for d in result.scalars().all()]


def _to_out(d: BaseDocument) -> BaseDocOut:
    return BaseDocOut(
        id=str(d.id),
        filename=d.filename,
        doc_type=d.doc_type,
        processing_status=d.processing_status,
        chunk_count=d.chunk_count,
        file_size=d.file_size,
        uploaded_by=d.uploaded_by,
        created_at=d.created_at,
    )
