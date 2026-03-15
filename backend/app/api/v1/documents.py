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
from app.db.models.project import Project
from app.db.models.user import User
from app.db.session import get_db
from app.tasks.processing import process_document_task

router = APIRouter(prefix="/projects/{project_id}/documents", tags=["documents"])


class DocumentOut(BaseModel):
    id: str
    project_id: str
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
            MizanDocument.project_id == uuid.UUID(project_id),
            MizanDocument.deleted_at.is_(None),
        )
    )
    docs = result.scalars().all()
    return [DocumentOut(id=str(d.id), project_id=str(d.project_id), role=d.role, name=d.name, file_type=d.file_type, file_size=d.file_size, processing_status=d.processing_status, ai_summary=d.ai_summary, page_count=d.page_count, word_count=d.word_count, created_at=d.created_at) for d in docs]


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
        project_id=project.id,
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

    return DocumentOut(id=str(doc.id), project_id=str(doc.project_id), role=doc.role, name=doc.name, file_type=doc.file_type, file_size=doc.file_size, processing_status=doc.processing_status, ai_summary=doc.ai_summary, page_count=doc.page_count, word_count=doc.word_count, created_at=doc.created_at)
