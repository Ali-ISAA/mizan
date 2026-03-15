"""Project CRUD — each project pairs a requirements doc with a compliance doc."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.db.models.project import Project
from app.db.models.user import User
from app.db.session import get_db

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str | None
    status: str
    overall_score: float | None
    requirements_count: int
    met_count: int
    partial_count: int
    not_met_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ProjectOut])
async def list_projects(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.tenant_id == user.tenant_id, Project.deleted_at.is_(None)).order_by(Project.created_at.desc())
    )
    return [ProjectOut(id=str(p.id), name=p.name, description=p.description, status=p.status, overall_score=p.overall_score, requirements_count=p.requirements_count, met_count=p.met_count, partial_count=p.partial_count, not_met_count=p.not_met_count, created_at=p.created_at, updated_at=p.updated_at) for p in result.scalars().all()]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(body: ProjectCreate, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    project = Project(tenant_id=user.tenant_id, created_by=user.id, name=body.name, description=body.description)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectOut(id=str(project.id), name=project.name, description=project.description, status=project.status, overall_score=project.overall_score, requirements_count=project.requirements_count, met_count=project.met_count, partial_count=project.partial_count, not_met_count=project.not_met_count, created_at=project.created_at, updated_at=project.updated_at)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, uuid.UUID(project_id))
    if not project or project.tenant_id != user.tenant_id or project.deleted_at:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectOut(id=str(project.id), name=project.name, description=project.description, status=project.status, overall_score=project.overall_score, requirements_count=project.requirements_count, met_count=project.met_count, partial_count=project.partial_count, not_met_count=project.not_met_count, created_at=project.created_at, updated_at=project.updated_at)


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, uuid.UUID(project_id))
    if not project or project.tenant_id != user.tenant_id or project.deleted_at:
        raise HTTPException(status_code=404, detail="Project not found")
    project.deleted_at = datetime.utcnow()
    await db.commit()
