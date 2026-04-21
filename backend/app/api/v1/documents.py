"""Document upload and management within a project."""
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
from app.db.models.project import Project
from app.db.models.user import User
from app.db.session import get_db
from app.tasks.processing import process_document_task
from app.tasks.process_user_document import process_user_document_task

router = APIRouter(prefix="/projects/{project_id}/documents", tags=["documents"])
global_router = APIRouter(prefix="/documents", tags=["documents"])


@global_router.get("", response_model=list[DocumentOut])
async def list_all_documents(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MizanDocument).where(
            MizanDocument.tenant_id == user.tenant_id,
            MizanDocument.deleted_at.is_(None),
        )
    )
    docs = result.scalars().all()
    return [DocumentOut(id=str(d.id), role=d.role, name=d.name, file_type=d.file_type, file_size=d.file_size, processing_status=d.processing_status, ai_summary=d.ai_summary, page_count=d.page_count, word_count=d.word_count, created_at=d.created_at) for d in docs]


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


async def _get_project(project_id: str, user: User, db: AsyncSession) -> Project:
    project = await db.get(Project, uuid.UUID(project_id))
    if not project or project.tenant_id != user.tenant_id or project.deleted_at:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=list[DocumentOut])
async def list_documents(project_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    await _get_project(project_id, user, db)
    result = await db.execute(
        select(MizanDocument).where(
            MizanDocument.tenant_id == user.tenant_id,
            MizanDocument.deleted_at.is_(None),
        )
    )
    docs = result.scalars().all()
    return [DocumentOut(id=str(d.id), role=d.role, name=d.name, file_type=d.file_type, file_size=d.file_size, processing_status=d.processing_status, ai_summary=d.ai_summary, page_count=d.page_count, word_count=d.word_count, created_at=d.created_at) for d in docs]


@router.post("", response_model=DocumentOut, status_code=201)
async def upload_document(
    project_id: str,
    role: str = Form(...),  # "requirement" | "compliance"
    file: UploadFile = File(...),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    if role not in ("requirement", "compliance"):
        raise HTTPException(status_code=400, detail="role must be 'requirement' or 'compliance'")

    project = await _get_project(project_id, user, db)

    # Check if a doc with this role already exists (replace if so)
    existing = await db.execute(
        select(MizanDocument).where(
            MizanDocument.project_id == project.id,
            MizanDocument.role == role,
            MizanDocument.deleted_at.is_(None),
        )
    )
    old_doc = existing.scalar_one_or_none()
    if old_doc:
        old_doc.deleted_at = datetime.utcnow()

    content = await file.read()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_file_size_mb}MB limit")

    file_hash = hashlib.sha256(content).hexdigest()
    ext = os.path.splitext(file.filename or "")[1].lower()
    doc_id = uuid.uuid4()
    upload_path = os.path.join(settings.upload_dir, str(doc_id))
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Save original filename with extension
    save_name = f"{doc_id}{ext}"
    save_path = os.path.join(settings.upload_dir, save_name)
    with open(save_path, "wb") as f:
        f.write(content)

    doc = MizanDocument(
        id=doc_id,
        tenant_id=user.tenant_id,
        created_by=user.id,
        role=role,
        name=file.filename or "document",
        file_type=ext.lstrip(".") or None,
        file_size=len(content),
        file_url=save_path,
        file_hash=file_hash,
        processing_status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Reset project status when a new document is uploaded
    if project.status == "complete":
        project.status = "pending"
        await db.commit()

    # Dispatch Celery task
    process_document_task.delay(str(doc.id), save_path, str(project.id))

    return DocumentOut(id=str(doc.id), role=doc.role, name=doc.name, file_type=doc.file_type, file_size=doc.file_size, processing_status=doc.processing_status, ai_summary=doc.ai_summary, page_count=doc.page_count, word_count=doc.word_count, created_at=doc.created_at)


# Global upload endpoint for user documents
@global_router.post("/upload", status_code=201)
async def user_document_upload(
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

    # Verify base document exists
    from app.db.models.base_document import BaseDocument
    base_doc = await db.get(BaseDocument, base_doc_uuid)
    if not base_doc:
        raise HTTPException(status_code=404, detail="Base document not found")

    content = await file.read()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_file_size_mb}MB limit")

    # Save file
    doc_id = uuid.uuid4()
    ext = os.path.splitext(file.filename or "")[1].lower()
    save_name = f"{doc_id}{ext}"
    save_path = os.path.join(settings.upload_dir, save_name)
    os.makedirs(settings.upload_dir, exist_ok=True)

    with open(save_path, "wb") as f:
        f.write(content)

    # Create MizanDocument
    doc = MizanDocument(
        id=doc_id,
        tenant_id=user.tenant_id,
        created_by=user.id,
        role="compliance",  # User uploads are compliance docs
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

    # Trigger Celery task for Noesia processing
    process_user_document_task.delay(str(doc.id), save_path)

    return {
        "id": str(doc.id),
        "name": doc.name,
        "file_size": doc.file_size,
        "processing_status": doc.processing_status,
        "base_document_id": str(doc.base_document_id),
    }


# Endpoint to get chunks for a document
@global_router.get("/{document_id}/chunks")
async def get_document_chunks(
    project_id: str,
    document_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch chunks for a user-uploaded document."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    # Verify project exists (for project-scoped documents)
    try:
        await _get_project(project_id, user, db)
    except HTTPException:
        # If project doesn't exist, still allow access to user's own documents
        pass

    doc = await db.get(MizanDocument, doc_uuid)
    if not doc or doc.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.processing_status != "completed":
        raise HTTPException(status_code=400, detail=f"Document not ready (status: {doc.processing_status})")

    # Fetch chunks
    result = await db.execute(
        select(MizanDocumentChunk)
        .where(MizanDocumentChunk.mizan_document_id == doc_uuid)
        .order_by(MizanDocumentChunk.chunk_index)
    )
    chunks = result.scalars().all()

    # Format response (match superadmin format)
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
