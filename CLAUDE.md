# Mizan — Claude Instructions

## Project Overview

Mizan is a compliance analysis AI application. Users upload two documents:
- **Document A** — requirements/policy doc (RFP, government regulation, standard)
- **Document B** — compliance doc (RFP response, organization policy, report)

Mizan analyzes both and produces: compliance score, gap report, clause-by-clause mapping, and AI chat.

**Stack:**
- **Backend**: Python + FastAPI + SQLAlchemy async + Celery + Redis
- **Frontend**: React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **Superadmin**: React 19 + TypeScript (separate Vite app)
- **DB**: PostgreSQL 17 (async via asyncpg)
- **Vector store**: Qdrant
- **AI ingestion**: Noesia API (two-step: upload → ingest job)
- **LLM**: LiteLLM (provider-agnostic: DashScope, z.ai, Ollama, OpenAI)

---

## Workflow

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- Write detailed specs upfront
- Stop and re-plan if something goes sideways

### 2. Subagent Strategy
- Use subagents to keep main context clean
- Offload research, exploration, and parallel analysis

### 3. Verification Before Done
- Never mark a task complete without proving it works
- Run tests, check logs, demonstrate correctness

### 4. Demand Elegance
- For non-trivial changes: pause and ask "is there a more elegant way?"
- Skip for simple, obvious fixes

### 5. Autonomous Bug Fixing
- When given a bug report: just fix it
- Point at logs, errors, failing tests — then resolve them

---

## Task Management
1. **Plan First**: Write plan to `tasks/todo.md`
2. **Verify Plan**: Check in before implementation
3. **Track Progress**: Mark items complete as you go
4. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Core Principles
- **Simplicity First**: Every change as simple as possible
- **No Laziness**: Find root causes, no temporary fixes
- **Minimal Impact**: Only touch what's necessary

---

## Stack Notes

### Backend (`backend/app/`)
- Config: `app/config.py` (pydantic-settings, reads .env)
- DB session: `app/db/session.py` (async SQLAlchemy engine)
- Models: `app/db/models/` (SQLAlchemy 2 mapped_column style)
- Services: `app/services/` (noesia, llm, qdrant_search, compliance, report)
- Tasks: `app/tasks/` (Celery: processing, analysis)
- API: `app/api/v1/` (FastAPI routers)
- Worker: `app/worker.py` (Celery app instance)

### Frontend (`frontend/src/`)
- Pages: `pages/` (React Router routes)
- Components: `components/` (reusable UI)
- Hooks: `hooks/` (React Query data fetching)
- Stores: `stores/` (Zustand state)
- API client: `lib/api.ts` (axios with JWT interceptor)

### Port Map
- Backend API: `localhost:8001`   (DMS uses 7001)
- Frontend: `localhost:8002`      (DMS uses 7002)
- Superadmin: `localhost:8003`    (DMS uses 7003)
- Postgres: `localhost:5435`      (DMS uses 5434)
- Redis: `localhost:6382`         (DMS uses 6381)
- Qdrant: `localhost:7014`        (DMS uses 7004)

### Key Patterns
- All DB queries use async SQLAlchemy 2 (`async with AsyncSession`)
- JWT auth: access token (30min) + refresh token (7 days) rotation
- Multi-tenant: all data isolated by `tenant_id` FK
- Celery tasks: wrap async pipelines with `asyncio.run()`
- Noesia: two-step flow — upload file → create ingest job → poll until done
