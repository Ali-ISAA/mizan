"""Semantic search and Q&A within a project's documents."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user

from app.db.models.user import User
from app.db.session import get_db
from app.services import llm as llm_service
from app.services.qdrant_search import search as qdrant_search
import uuid

router = APIRouter(prefix="/projects/{project_id}/search", tags=["search"])


async def _get_project(project_id: str, user: User, db: AsyncSession) -> Project:
    project = await db.get(Project, uuid.UUID(project_id))
    if not project or project.tenant_id != user.tenant_id or project.deleted_at:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10


class AskRequest(BaseModel):
    question: str
    top_k: int = 8


class SearchResult(BaseModel):
    text: str
    score: float
    metadata: dict


@router.post("/semantic", response_model=list[SearchResult])
async def semantic_search(
    project_id: str,
    body: SearchRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project(project_id, user, db)
    if not project.noesia_collection_name:
        raise HTTPException(status_code=400, detail="Documents not yet ingested")
    results = await qdrant_search(project.noesia_collection_name, body.query, top_k=body.top_k)
    return [SearchResult(text=r["text"], score=r["score"], metadata=r["metadata"]) for r in results]


@router.post("/ask")
async def ask(
    project_id: str,
    body: AskRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project(project_id, user, db)
    if not project.noesia_collection_name:
        raise HTTPException(status_code=400, detail="Documents not yet ingested")

    chunks = await qdrant_search(project.noesia_collection_name, body.question, top_k=body.top_k)
    context = "\n\n---\n\n".join(c["text"] for c in chunks if c.get("text"))

    messages = [
        {"role": "system", "content": "You are a compliance analyst assistant. Answer questions using the provided document context. Be precise and cite relevant sections when possible."},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {body.question}"},
    ]
    answer = await llm_service.chat(messages, max_tokens=800)
    return {"answer": answer, "sources": [{"text": c["text"][:200], "score": c["score"]} for c in chunks[:3]]}
