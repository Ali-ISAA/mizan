"""Document upload and management."""
import hashlib
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.config import settings
from app.db.models.document import MizanDocument
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.models.user import User
from app.db.session import get_db
from app.tasks.process_user_document import process_user_document_task

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentOut(BaseModel):
    id: str
    role: str
    name: str
    file_type: str | None
    file_size: int | None
    processing_status: str
    ai_summary: str | None
    page_count: int | None
    word_count: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[DocumentOut])
async def list_documents(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    """List all documents for the current user's tenant."""
    result = await db.execute(
        select(MizanDocument).where(
            MizanDocument.tenant_id == user.tenant_id,
            MizanDocument.deleted_at.is_(None),
        )
    )
    docs = result.scalars().all()
    return [DocumentOut(id=str(d.id), role=d.role, name=d.name, file_type=d.file_type, file_size=d.file_size, processing_status=d.processing_status, ai_summary=d.ai_summary, page_count=d.page_count, word_count=d.word_count, created_at=d.created_at) for d in docs]


@router.post("/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    base_document_id: str = Form(...),
    doc_type: str = Form(...),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a user document for comparison against a base document."""
    try:
        base_doc_uuid = uuid.UUID(base_document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid base_document_id")

    from app.db.models.base_document import BaseDocument
    base_doc = await db.get(BaseDocument, base_doc_uuid)
    if not base_doc:
        raise HTTPException(status_code=404, detail="Base document not found")

    content = await file.read()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_file_size_mb}MB limit")

    doc_id = uuid.uuid4()
    ext = os.path.splitext(file.filename or "")[1].lower()
    save_name = f"{doc_id}{ext}"
    save_path = os.path.join(settings.upload_dir, save_name)
    os.makedirs(settings.upload_dir, exist_ok=True)

    with open(save_path, "wb") as f:
        f.write(content)

    doc = MizanDocument(
        id=doc_id,
        tenant_id=user.tenant_id,
        created_by=user.id,
        role="compliance",
        name=file.filename or "document",
        file_type=ext.lstrip(".") or None,
        file_size=len(content),
        file_url=save_path,
        processing_status="pending",
        base_document_id=base_doc_uuid,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    process_user_document_task.delay(str(doc.id), save_path)

    return {
        "id": str(doc.id),
        "name": doc.name,
        "file_size": doc.file_size,
        "processing_status": doc.processing_status,
        "base_document_id": str(doc.base_document_id),
    }


@router.get("/{document_id}/chunks")
async def get_document_chunks(
    document_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch chunks for a document."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.processing_status != "completed":
        raise HTTPException(status_code=400, detail=f"Document not ready (status: {doc.processing_status})")

    result = await db.execute(
        select(MizanDocumentChunk)
        .where(MizanDocumentChunk.mizan_document_id == doc_uuid)
        .order_by(MizanDocumentChunk.chunk_index)
    )
    chunks = result.scalars().all()

    chunk_dicts = [
        {
            "id": str(c.id),
            "text": c.text,
            "metadata": {
                "section_header": c.section_header,
                "section_level": c.section_level,
                "chunk_index": c.chunk_index,
                "document_name": c.document_name,
            },
        }
        for c in chunks
    ]

    return {"chunks": chunk_dicts, "total": len(chunk_dicts)}
