"""AI chat with SSE streaming over project documents."""
import json
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.db.models.project import Project
from app.db.models.user import User
from app.db.session import get_db
from app.services import llm as llm_service
from app.services.qdrant_search import search as qdrant_search

router = APIRouter(prefix="/projects/{project_id}/ai", tags=["ai_chat"])


async def _get_project(project_id: str, user: User, db: AsyncSession) -> Project:
    project = await db.get(Project, uuid.UUID(project_id))
    if not project or project.tenant_id != user.tenant_id or project.deleted_at:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    top_k: int = 8


@router.post("/chat")
async def chat(
    project_id: str,
    body: ChatRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project(project_id, user, db)
    if not project.noesia_collection_name:
        raise HTTPException(status_code=400, detail="Documents not yet ingested")

    user_question = next((m.content for m in reversed(body.messages) if m.role == "user"), "")
    chunks = await qdrant_search(project.noesia_collection_name, user_question, top_k=body.top_k) if user_question else []
    context = "\n\n---\n\n".join(c["text"] for c in chunks if c.get("text"))

    system_msg = {
        "role": "system",
        "content": (
            f"You are a compliance analyst AI for project '{project.name}'. "
            "You have access to both the requirements document and the compliance document. "
            "Help users understand compliance gaps, assess requirements, and answer questions about the documents. "
            f"\n\nRelevant document context:\n{context}"
        ),
    }

    messages = [system_msg] + [{"role": m.role, "content": m.content} for m in body.messages]

    async def generate() -> AsyncGenerator[str, None]:
        async for token in llm_service.chat_stream(messages):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
