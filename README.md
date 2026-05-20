<div align="center">
  <img src="images/mizan-logo.png" alt="Mizan Logo" width="120" />

# Mizan AI — Legal Compliance Platform

> **Mizan** (ميزان) means *balance* or *scales* in Arabic — the foundation of justice and compliance.

</div>

Mizan is an AI-powered compliance analysis platform that compares policy documents against regulatory standards and produces detailed clause-by-clause compliance reports, gap analyses, and risk assessments.

---

## What It Does

Upload two documents:

| Document | Role | Example |
|----------|------|---------|
| **Document A** (Base) | The regulatory standard or law | Saudi Labour Law, GDPR, ISO 27001 |
| **Document B** (Your Policy) | Your organisation's compliance document | HR Policy, Privacy Policy, Security Framework |

Mizan analyses every section of your policy against the full regulation and produces:

- **Compliance Score** — percentage of policy sections that accurately reflect the regulation
- **Clause-by-Clause Mapping** — each policy section marked as Compliant, Gap, or Conflict
- **AI Narrative Report** — executive summary and risk assessment written in plain language
- **Gap Report** — prioritised list of issues by severity (Critical, Medium, Low)
- **Analytics Dashboard** — trends, risk distribution, and regulation breakdowns across all your documents
- **AI Chat** — ask questions about your compliance results

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Backend API   │     │   Superadmin    │
│  React 19 +     │────▶│  FastAPI +      │◀────│  React 19 +     │
│  TypeScript     │     │  SQLAlchemy     │     │  TypeScript     │
│  Tailwind CSS   │     │  Celery + Redis │     │  Tailwind CSS   │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
     ┌────────▼──────┐  ┌────────▼──────┐  ┌───────▼────────┐
     │  PostgreSQL   │  │    Qdrant     │  │  Noesia API    │
     │  (primary DB) │  │ (vector store)│  │ (doc ingestion)│
     └───────────────┘  └───────────────┘  └────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python 3.11, FastAPI, SQLAlchemy 2 (async) |
| Task Queue | Celery + Redis |
| Database | PostgreSQL 17 (async via asyncpg) |
| Vector Store | Qdrant |
| Document Ingestion | Noesia API (upload → ingest → poll) |
| LLM | LiteLLM — provider-agnostic (DashScope / Qwen, OpenAI, Ollama) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Superadmin | React 19, TypeScript, Vite, Tailwind CSS |
| Auth | JWT (access token 30 min + refresh token 7 days rotation) |
| Multi-tenancy | All data isolated by `tenant_id` |

---

## How the Analysis Works

1. **Article Extraction** — Mizan extracts individual articles from both documents using document structure metadata (fast path) or LLM fallback
2. **Compliance-Doc-Driven Comparison** — each section of *your policy* is checked against the full regulation text, asking "Is this section accurate and complete per the law?"
3. **Finding Classification** — each policy section is classified as:
   - `compliant` — accurately reflects the regulation
   - `gap` — partially addressed but missing key requirements
   - `conflict` — contradicts the regulation
4. **Scoring** — compliance score = compliant sections ÷ applicable sections × 100
5. **Narrative Generation** — LLM generates an executive summary and risk assessment

---

## Features

### User Application (`localhost:8002`)
- **Upload** — 3-step wizard: select regulation type → choose base document → upload your policy
- **My Documents** — view all uploaded documents and their processing status
- **Compliance Analysis** — real-time progress tracking, clause-by-clause results, AI narrative
- **Reports & Analytics** — compliance trends, risk distribution charts, per-document scores, regulation breakdowns
- **AI Chat** — contextual Q&A about your compliance results

### Superadmin Panel (`localhost:8003`)
- **Tenants** — manage organisations on the platform
- **Users** — manage users across tenants
- **Base Documents** — upload and manage regulatory reference documents
- **Article Extraction** — re-extract articles from any base document

---

## Project Structure

```
mizan/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # FastAPI routers (auth, documents, analytics…)
│   │   ├── db/
│   │   │   ├── models/      # SQLAlchemy ORM models
│   │   │   └── session.py   # Async DB engine
│   │   ├── services/        # Business logic (comparator, noesia, LLM…)
│   │   ├── tasks/           # Celery tasks (processing, comparison)
│   │   └── config.py        # Pydantic-settings config
├── frontend/                # User-facing React app
│   └── src/
│       ├── components/      # Reusable UI components
│       ├── pages/           # Route-level page components
│       ├── hooks/           # React Query data fetching
│       └── lib/api.ts       # Axios client with JWT interceptor
├── superadmin/              # Admin React app
│   └── src/
│       ├── components/      # Layout, shared components
│       └── pages/           # Admin pages
├── docs/                    # Design specs and implementation plans
└── images/                  # Brand assets (logo, favicon)
```

---

## Running Locally

### Prerequisites
- Docker & Docker Compose
- A `.env` file at the project root (see `.env.example`)

### Start All Services

```bash
docker compose up -d
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8002 |
| Superadmin | http://localhost:8003 |
| Backend API | http://localhost:8001 |
| API Docs | http://localhost:8001/docs |

### Port Map

| Service | Port |
|---------|------|
| Backend API | 8001 |
| Frontend | 8002 |
| Superadmin | 8003 |
| PostgreSQL | 5435 |
| Redis | 6382 |
| Qdrant | 7014 |

---

## Environment Variables

Key variables required in `.env`:

```env
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
QDRANT_URL=http://...
NOESIA_API_KEY=...
NOESIA_API_URL=...
LITELLM_MODEL=...
SECRET_KEY=...
```

---

## Licence

Private — all rights reserved.
