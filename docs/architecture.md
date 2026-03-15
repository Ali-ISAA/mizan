# Mizan — Architecture Reference

_Last updated: 2026-03-15_

---

## Overview

Mizan is a multi-tenant compliance analysis AI application. Users upload two documents per analysis session:

- **Document A** (Requirements) — the authoritative source of requirements, e.g. an RFP, government regulation, ISO standard, or internal policy mandate.
- **Document B** (Compliance) — the document being evaluated for compliance, e.g. an RFP response, an organization's policy document, an audit report, or a vendor submission.

Mizan ingests both documents into a vector store (via Noesia), runs structured compliance analysis using an LLM, and delivers:

1. **Compliance Score** — a weighted percentage score indicating overall compliance level.
2. **Gap Report** — a list of requirements in Document A that are not addressed (or are insufficiently addressed) in Document B.
3. **Clause-by-Clause Mapping** — a structured table linking each requirement clause in Document A to the corresponding section(s) in Document B, with a per-clause compliance status.
4. **AI Chat** — a retrieval-augmented chat panel where users can ask questions about both documents, with the LLM citing specific clauses.

---

## Core Workflow

```
User uploads Doc A + Doc B
        │
        ▼
Backend: store files locally, create Analysis record (status=pending)
        │
        ▼
Celery task: processing
  ├── Upload Doc A to Noesia → get document_id_a
  ├── Upload Doc B to Noesia → get document_id_b
  ├── Create Noesia ingest job (document_ids=[a, b]) → job_id
  └── Poll job until status=completed  ──► update Analysis (status=ingested)
        │
        ▼
Celery task: analysis
  ├── Retrieve clause list from Doc A (Qdrant semantic search + LLM extraction)
  ├── For each clause: search Doc B chunks in Qdrant → score compliance
  ├── Aggregate scores → overall compliance score
  ├── Identify gaps (clauses with no match or low score)
  └── Persist: ClauseMapping rows, GapReport row, update Analysis score/status
        │
        ▼
Frontend polls Analysis status → renders score, gap report, clause table
        │
        ▼
User opens AI Chat → frontend sends message → backend RAG pipeline
  ├── Embed query (Ollama)
  ├── Search both Doc A and Doc B collections in Qdrant
  ├── Build context from top-k chunks
  └── LLM generates answer with citations → stream to frontend
```

---

## Service Map

| Service | Location | Purpose |
|---|---|---|
| `noesia.py` | `backend/app/services/noesia.py` | Two-step Noesia integration: file upload + ingest job creation + job polling |
| `llm.py` | `backend/app/services/llm.py` | LiteLLM wrapper for analysis and chat completions, provider-agnostic |
| `qdrant_search.py` | `backend/app/services/qdrant_search.py` | Semantic search against Qdrant collections; query embedding via Ollama |
| `compliance.py` | `backend/app/services/compliance.py` | Core compliance logic: clause extraction, per-clause scoring, gap detection |
| `report.py` | `backend/app/services/report.py` | Report assembly: builds structured GapReport and ClauseMapping from analysis results |
| `auth.py` | `backend/app/services/auth.py` | JWT creation/validation, password hashing, refresh token rotation |

---

## API Routes

All routes are prefixed `/api/v1/`.

| Router file | Prefix | Key endpoints |
|---|---|---|
| `auth.py` | `/auth` | `POST /login`, `POST /refresh`, `POST /logout` |
| `users.py` | `/users` | `GET /me`, `PATCH /me`, `POST /` (admin only) |
| `tenants.py` | `/tenants` | `GET /`, `POST /`, `PATCH /{id}` (superadmin only) |
| `analyses.py` | `/analyses` | `POST /` (create + kick off Celery), `GET /`, `GET /{id}`, `DELETE /{id}` |
| `documents.py` | `/documents` | `POST /upload` (presign or direct upload), `GET /{id}` |
| `clauses.py` | `/clauses` | `GET /?analysis_id=` (clause mapping table), `GET /{id}` |
| `gaps.py` | `/gaps` | `GET /?analysis_id=` (gap report items) |
| `chat.py` | `/chat` | `POST /` (RAG chat, streaming SSE), `GET /history?analysis_id=` |
| `health.py` | `/health` | `GET /` (liveness + readiness check) |

---

## Database Models

All models carry `id` (UUID PK), `created_at`, `updated_at`, and `deleted_at` (soft delete) unless noted.

| Model | Table | Key fields | Notes |
|---|---|---|---|
| `Tenant` | `tenants` | `name`, `slug`, `plan`, `is_active` | Top-level isolation unit |
| `User` | `users` | `tenant_id`, `email`, `hashed_password`, `role` (`admin`/`member`) | Role scoped per tenant |
| `RefreshToken` | `refresh_tokens` | `user_id`, `token_hash`, `expires_at`, `revoked_at` | One row per active session |
| `Analysis` | `analyses` | `tenant_id`, `user_id`, `title`, `status`, `score`, `noesia_job_id` | Status: `pending` → `ingested` → `analyzing` → `completed` / `failed` |
| `Document` | `documents` | `analysis_id`, `role` (`requirements`/`compliance`), `filename`, `noesia_document_id`, `file_path` | One per doc slot per analysis |
| `ClauseMapping` | `clause_mappings` | `analysis_id`, `clause_ref`, `clause_text`, `matched_text`, `match_score`, `status` (`met`/`partial`/`unmet`) | One row per requirement clause |
| `GapReport` | `gap_reports` | `analysis_id`, `total_clauses`, `met_count`, `partial_count`, `unmet_count`, `summary` | One row per analysis (1:1) |
| `ChatMessage` | `chat_messages` | `analysis_id`, `user_id`, `role` (`user`/`assistant`), `content`, `citations` (JSONB) | Append-only chat history |

---

## Frontend Pages

| Page component | Route | Purpose |
|---|---|---|
| `LoginPage` | `/login` | Email/password login, redirects on success |
| `DashboardPage` | `/` | List of analyses for the tenant, status badges, quick actions |
| `NewAnalysisPage` | `/analyses/new` | Upload form: Doc A + Doc B, title, submit → creates analysis |
| `AnalysisDetailPage` | `/analyses/:id` | Tabbed view: Overview (score), Clause Map, Gap Report, AI Chat |
| `ClauseMappingTab` | (tab) | Sortable/filterable table of all clause mappings |
| `GapReportTab` | (tab) | Gap summary card + list of unmet/partial clauses |
| `ChatTab` | (tab) | Streaming chat interface, citations rendered inline |
| `SettingsPage` | `/settings` | Tenant settings, user management (admin only) |
| `ProfilePage` | `/profile` | Current user profile, password change |

---

## Superadmin Pages

Separate Vite app on port 7003. Uses its own JWT (superadmin role).

| Page | Route | Purpose |
|---|---|---|
| `SALoginPage` | `/login` | Superadmin login |
| `TenantsPage` | `/tenants` | CRUD for tenants, activate/deactivate |
| `UsersPage` | `/users` | Cross-tenant user listing, impersonation |
| `SystemPage` | `/system` | Health checks, Celery queue depth, config display |

---

## Infrastructure

### Port Map

| Service | Port |
|---|---|
| Backend API (FastAPI) | `7001` |
| Frontend (Vite dev) | `7002` |
| Superadmin (Vite dev) | `7003` |
| PostgreSQL 17 | `5434` |
| Redis | `6381` |
| Qdrant | `7004` |
| Ollama | `11434` (default) |

### Docker Services (`docker-compose.yml`)

| Service name | Image | Purpose |
|---|---|---|
| `db` | `postgres:17-alpine` | Primary relational database |
| `redis` | `redis:7-alpine` | Celery broker + result backend |
| `qdrant` | `qdrant/qdrant` | Vector store for document chunk embeddings |
| `backend` | local Dockerfile | FastAPI app (uvicorn) |
| `worker` | local Dockerfile | Celery worker (`--pool=solo` for dev) |
| `frontend` | local Dockerfile | Vite dev server (or nginx for prod) |
| `superadmin` | local Dockerfile | Superadmin Vite dev server |

---

## Key Design Decisions

### Multi-Tenant Isolation
Every database model (except `Tenant` itself) carries a `tenant_id` foreign key. All API queries filter by the calling user's `tenant_id`, enforced at the service layer. There is no row-level security at the DB layer — isolation is application-enforced, with the superadmin role as the only cross-tenant actor.

### Async-First Backend
All database access uses SQLAlchemy 2 async sessions (`async with AsyncSession`). FastAPI endpoints are all `async def`. Blocking I/O (file reads, HTTP calls to Noesia) is either awaited via `httpx.AsyncClient` or offloaded to Celery. Sync SQLAlchemy is never used in async context.

### Two-Step Noesia Ingest
Noesia requires a two-step flow:
1. Upload each file via `POST /documents/upload` → receive a `document_id` per file.
2. Create an ingest job via `POST /ingest/jobs` with `document_ids: [a, b]` and `custom_metadata` → receive a `job_id`.
3. Poll `GET /ingest/jobs/{job_id}` until `status == "completed"` (or `"failed"`).

This is intentional: decouples file transfer from processing. Mizan never skips step 1 and never passes `custom_metadata` in the upload step.

### Qdrant for Semantic Search
After Noesia ingestion, document chunks with embeddings are available in Qdrant. Mizan does not re-embed during analysis — it queries the existing collection. The Ollama embed model used for query-time embedding **must match** the model Noesia used during ingest (configured via `OLLAMA_EMBED_MODEL`).

### Celery Task Architecture
Processing and analysis are split into two Celery tasks chained together:
- `tasks.processing.process_analysis(analysis_id)` — handles Noesia upload + ingest + polling.
- `tasks.analysis.run_analysis(analysis_id)` — handles clause extraction, scoring, gap detection.

Each task is a sync function that calls `asyncio.run(async_pipeline())` internally. This avoids multiprocessing/event-loop conflicts in Celery workers. On Windows/macOS dev, use `--pool=solo`.

### JWT Auth with Refresh Rotation
Access tokens are short-lived (30 min). Refresh tokens are stored as hashed values in the `refresh_tokens` table with an expiry. On refresh, the old token is revoked (`revoked_at` set) and a new pair is issued. Revoked tokens are rejected immediately, preventing token reuse after logout or rotation.

### LLM Provider Abstraction via LiteLLM
All LLM calls go through `services/llm.py` which wraps LiteLLM. The provider and model are configured via environment variables (`LLM_PROVIDER`, `LLM_MODEL`). Switching providers requires only `.env` changes, no code changes. The chat panel optionally uses a separate model (`CHAT_LLM_*`) to allow a faster/cheaper model for analysis and a smarter model for interactive chat.
