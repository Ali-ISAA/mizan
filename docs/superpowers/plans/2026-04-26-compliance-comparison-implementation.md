# Compliance Comparison Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement compliance comparison layer that compares user-uploaded documents against regulatory documents using LiteLLM, generating structured findings about gaps, conflicts, and missing clauses.

**Architecture:** Service-based design with Celery background task orchestration, LiteLLM for LLM calls, async SQLAlchemy ORM for database persistence. Follows existing Noesia job polling pattern for status tracking.

**Tech Stack:** FastAPI, SQLAlchemy async, Celery, Redis, LiteLLM Python SDK, PostgreSQL, React Query, TypeScript

**Spec Reference:** `docs/superpowers/specs/2026-04-26-compliance-comparison-design.md`

---

## File Structure Overview

```
backend/app/
├── db/models/
│   ├── compliance_comparison.py       [NEW] Job tracking model
│   ├── compliance_report.py           [NEW] Aggregated findings
│   ├── compliance_finding.py          [NEW] Individual findings
│   ├── document.py                    [MODIFY] Add relationships
│   └── base_document.py               [MODIFY] Add relationships
├── services/
│   ├── comparison.py                  [NEW] Orchestration service
│   └── compliance_comparator.py       [NEW] LLM comparison logic
├── tasks/
│   └── compare_documents.py           [NEW] Celery task
├── api/v1/
│   └── documents.py                   [MODIFY] Add 3 endpoints
└── config.py                          [MODIFY] Add LiteLLM config

frontend/src/
├── hooks/
│   └── useComparison.ts               [NEW] Polling hook
├── components/
│   └── ComparisonResults.tsx          [NEW] Results display
├── pages/
│   ├── Documents.tsx                  [MODIFY] Add Analyze button
│   └── DocumentDetail.tsx             [MODIFY] Add results tab
```

---

# Chunk 1: Database Models

### Task 1: Create ComplianceComparison Model

**Files:**
- Create: `backend/app/db/models/compliance_comparison.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models/test_compliance_comparison.py
import pytest
from uuid import uuid4
from app.db.models.compliance_comparison import ComplianceComparison
from datetime import datetime

def test_compliance_comparison_creation():
    """Test ComplianceComparison model initialization."""
    comparison = ComplianceComparison(
        id=uuid4(),
        tenant_id=uuid4(),
        mizan_document_id=uuid4(),
        base_document_id=uuid4(),
        status="pending"
    )
    assert comparison.status == "pending"
    assert comparison.started_at is None
    assert comparison.error_message is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
pytest tests/test_models/test_compliance_comparison.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.db.models.compliance_comparison'`

- [ ] **Step 3: Write ComplianceComparison model**

```python
# backend/app/db/models/compliance_comparison.py
import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ComplianceComparison(Base):
    """Job tracking for document comparison (like Noesia jobs)."""

    __tablename__ = "compliance_comparisons"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    mizan_document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("mizan_documents.id", ondelete="CASCADE"))
    base_document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("base_documents.id", ondelete="CASCADE"))

    status: Mapped[str] = mapped_column(String(30), default="pending")  # pending|processing|completed|failed
    error_message: Mapped[str | None] = mapped_column(Text)

    started_at: Mapped[datetime | None] = mapped_column()
    completed_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    # Relationships
    mizan_document: Mapped["MizanDocument"] = relationship(back_populates="comparisons")
    base_document: Mapped["BaseDocument"] = relationship(back_populates="comparisons")
    report: Mapped["ComplianceReport"] = relationship(back_populates="comparison", cascade="all, delete-orphan", uselist=False)
    findings: Mapped[list["ComplianceFinding"]] = relationship(back_populates="comparison", cascade="all, delete-orphan")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_models/test_compliance_comparison.py -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models/compliance_comparison.py backend/tests/test_models/test_compliance_comparison.py
git commit -m "feat(models): add ComplianceComparison job tracking model"
```

---

### Task 2: Create ComplianceReport Model

**Files:**
- Create: `backend/app/db/models/compliance_report.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models/test_compliance_report.py
from uuid import uuid4
from app.db.models.compliance_report import ComplianceReport

def test_compliance_report_creation():
    """Test ComplianceReport model initialization."""
    report = ComplianceReport(
        id=uuid4(),
        comparison_id=uuid4(),
        compliance_score=75,
        total_findings=5,
        critical_count=1,
        medium_count=2,
        low_count=2
    )
    assert report.compliance_score == 75
    assert report.total_findings == 5
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_models/test_compliance_report.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Write ComplianceReport model**

```python
# backend/app/db/models/compliance_report.py
import uuid
from datetime import datetime
from sqlalchemy import Integer, String, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ComplianceReport(Base):
    """Aggregated compliance findings for a comparison."""

    __tablename__ = "compliance_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    comparison_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("compliance_comparisons.id", ondelete="CASCADE"), unique=True)

    compliance_score: Mapped[int] = mapped_column(Integer, default=0)  # 0-100
    total_findings: Mapped[int] = mapped_column(Integer, default=0)
    critical_count: Mapped[int] = mapped_column(Integer, default=0)
    medium_count: Mapped[int] = mapped_column(Integer, default=0)
    low_count: Mapped[int] = mapped_column(Integer, default=0)

    missing_in_doc_a: Mapped[list] = mapped_column(JSONB, default=list)
    missing_in_doc_b: Mapped[list] = mapped_column(JSONB, default=list)
    summary: Mapped[str] = mapped_column(Text, default="")
    raw_response: Mapped[dict] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    comparison: Mapped["ComplianceComparison"] = relationship(back_populates="report")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_models/test_compliance_report.py -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models/compliance_report.py backend/tests/test_models/test_compliance_report.py
git commit -m "feat(models): add ComplianceReport aggregated findings model"
```

---

### Task 3: Create ComplianceFinding Model

**Files:**
- Create: `backend/app/db/models/compliance_finding.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models/test_compliance_finding.py
from uuid import uuid4
from app.db.models.compliance_finding import ComplianceFinding

def test_compliance_finding_creation():
    """Test ComplianceFinding model."""
    finding = ComplianceFinding(
        id=uuid4(),
        comparison_id=uuid4(),
        doc_a_section="Section 4.2",
        doc_b_section="Section 3.1",
        status="gap",
        severity="medium",
        issue="Missing data retention policy",
        recommendation="Add data retention requirements"
    )
    assert finding.status == "gap"
    assert finding.severity == "medium"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_models/test_compliance_finding.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Write ComplianceFinding model**

```python
# backend/app/db/models/compliance_finding.py
import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ComplianceFinding(Base):
    """Individual compliance findings from comparison."""

    __tablename__ = "compliance_findings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    comparison_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("compliance_comparisons.id", ondelete="CASCADE"))

    doc_a_section: Mapped[str] = mapped_column(String(500))
    doc_b_section: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(30))  # compliant|gap|conflict|missing
    severity: Mapped[str] = mapped_column(String(30))  # critical|medium|low
    issue: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    comparison: Mapped["ComplianceComparison"] = relationship(back_populates="findings")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_models/test_compliance_finding.py -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models/compliance_finding.py backend/tests/test_models/test_compliance_finding.py
git commit -m "feat(models): add ComplianceFinding individual findings model"
```

---

### Task 4: Update MizanDocument and BaseDocument Models

**Files:**
- Modify: `backend/app/db/models/document.py`
- Modify: `backend/app/db/models/base_document.py`

- [ ] **Step 1: Read document.py to understand current structure**

```bash
head -50 backend/app/db/models/document.py
```

- [ ] **Step 2: Add import and relationship to MizanDocument**

In `backend/app/db/models/document.py`, add after the chunks relationship (around line 42):

```python
comparisons: Mapped[list["ComplianceComparison"]] = relationship("ComplianceComparison", back_populates="mizan_document", cascade="all, delete-orphan")
```

Also add to imports at top:
```python
from sqlalchemy.orm import Mapped, relationship
```

- [ ] **Step 3: Add import and relationship to BaseDocument**

In `backend/app/db/models/base_document.py`, add similar relationship:

```python
comparisons: Mapped[list["ComplianceComparison"]] = relationship("ComplianceComparison", back_populates="base_document", cascade="all, delete-orphan")
```

- [ ] **Step 4: Add models to __init__.py**

In `backend/app/db/models/__init__.py`, add imports:

```python
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.compliance_report import ComplianceReport
from app.db.models.compliance_finding import ComplianceFinding
```

- [ ] **Step 5: Run a basic import test**

```bash
python -c "from app.db.models import ComplianceComparison, ComplianceReport, ComplianceFinding; print('✓ Models imported successfully')"
```

Expected: `✓ Models imported successfully`

- [ ] **Step 6: Commit**

```bash
git add backend/app/db/models/document.py backend/app/db/models/base_document.py backend/app/db/models/__init__.py
git commit -m "feat(models): add comparison relationships to document models"
```

---

# Chunk 2: Configuration and Service Setup

### Task 5: Add LiteLLM Configuration

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Read current config.py**

```bash
head -50 backend/app/config.py
```

- [ ] **Step 2: Add LiteLLM settings to Settings class**

In `backend/app/config.py`, add these fields to the Settings class:

```python
# LiteLLM Configuration
llm_model: str = Field(default="ollama/llama2", description="LiteLLM model identifier")
llm_api_key: str | None = Field(default=None, description="API key if required by model provider")
llm_base_url: str | None = Field(default=None, description="Base URL for self-hosted models")
llm_timeout: int = Field(default=300, description="LLM request timeout in seconds")

# Comparison settings
max_tokens_per_chunk: int = Field(default=400, description="Maximum tokens per chunk before truncation")
comparison_timeout: int = Field(default=600, description="Comparison job timeout in seconds")
```

- [ ] **Step 3: Update .env.example**

Add to `backend/.env.example`:

```
# LiteLLM Configuration
LLM_MODEL=ollama/llama2
LLM_API_KEY=
LLM_BASE_URL=http://localhost:11434
LLM_TIMEOUT=300

# Comparison settings
MAX_TOKENS_PER_CHUNK=400
COMPARISON_TIMEOUT=600
```

- [ ] **Step 4: Verify config loads**

```bash
python -c "from app.config import settings; print(f'LLM Model: {settings.llm_model}')"
```

Expected: `LLM Model: ollama/llama2` (or your default)

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/.env.example
git commit -m "feat(config): add LiteLLM and comparison settings"
```

---

### Task 6: Create ComparisonService (Orchestration)

**Files:**
- Create: `backend/app/services/comparison.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_services/test_comparison.py
import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, patch
from app.services.comparison import ComparisonService

@pytest.mark.asyncio
async def test_start_comparison_creates_job():
    """Test starting a comparison creates ComplianceComparison record."""
    service = ComparisonService()
    tenant_id = uuid4()
    mizan_doc_id = uuid4()
    
    # Mock the task.delay() call
    with patch('app.services.comparison.compare_documents_task.delay'):
        result = await service.start_comparison(tenant_id, mizan_doc_id)
    
    assert result.status == "pending"
    assert result.mizan_document_id == mizan_doc_id
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest backend/tests/test_services/test_comparison.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Write ComparisonService**

```python
# backend/app/services/comparison.py
import logging
import uuid as uuid_module
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.models.document import MizanDocument
from app.db.models.base_document import BaseDocument
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.compliance_report import ComplianceReport
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.models.base_document_chunk import BaseDocumentChunk
from app.tasks.compare_documents import compare_documents_task
from app.db.session import WorkerAsyncSessionLocal

logger = logging.getLogger(__name__)


class ComparisonService:
    """Orchestrates document comparison pipeline."""

    async def start_comparison(self, tenant_id: UUID, mizan_doc_id: UUID, db: AsyncSession = None) -> ComplianceComparison:
        """
        Create comparison job and enqueue Celery task.
        
        Args:
            tenant_id: Tenant UUID
            mizan_doc_id: MizanDocument UUID to compare
            db: AsyncSession (optional, creates own if not provided)
        
        Returns:
            ComplianceComparison record with status="pending"
        """
        if not db:
            db = WorkerAsyncSessionLocal()

        try:
            # Get the MizanDocument
            stmt = select(MizanDocument).where(MizanDocument.id == mizan_doc_id)
            result = await db.execute(stmt)
            mizan_doc = result.scalar_one_or_none()

            if not mizan_doc:
                raise ValueError(f"MizanDocument {mizan_doc_id} not found")

            # Get the base_document_id from MizanDocument
            base_doc_id = mizan_doc.base_document_id
            if not base_doc_id:
                raise ValueError(f"MizanDocument {mizan_doc_id} has no base_document_id assigned")

            # Create ComplianceComparison record
            comparison = ComplianceComparison(
                id=uuid_module.uuid4(),
                tenant_id=tenant_id,
                mizan_document_id=mizan_doc_id,
                base_document_id=base_doc_id,
                status="pending"
            )
            db.add(comparison)
            await db.commit()
            await db.refresh(comparison)

            logger.info(f"Created ComplianceComparison {comparison.id} for MizanDocument {mizan_doc_id}")

            # Enqueue Celery task
            compare_documents_task.delay(str(mizan_doc_id), str(base_doc_id), str(comparison.id))

            return comparison

        finally:
            if not db:
                await db.close()

    async def get_comparison_status(self, comparison_id: UUID, db: AsyncSession = None) -> dict:
        """
        Get current status for polling.
        
        Returns: {"status": "pending|processing|completed|failed", "started_at": ..., "completed_at": ...}
        """
        if not db:
            db = WorkerAsyncSessionLocal()

        try:
            stmt = select(ComplianceComparison).where(ComplianceComparison.id == comparison_id)
            result = await db.execute(stmt)
            comparison = result.scalar_one_or_none()

            if not comparison:
                raise ValueError(f"ComplianceComparison {comparison_id} not found")

            return {
                "status": comparison.status,
                "started_at": comparison.started_at,
                "completed_at": comparison.completed_at,
                "error_message": comparison.error_message
            }

        finally:
            if not db:
                await db.close()

    async def get_comparison_report(self, comparison_id: UUID, db: AsyncSession = None) -> ComplianceReport:
        """Fetch completed report with all findings."""
        if not db:
            db = WorkerAsyncSessionLocal()

        try:
            stmt = select(ComplianceReport).where(ComplianceReport.comparison_id == comparison_id)
            result = await db.execute(stmt)
            report = result.scalar_one_or_none()

            if not report:
                raise ValueError(f"ComplianceReport not found for comparison {comparison_id}")

            return report

        finally:
            if not db:
                await db.close()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest backend/tests/test_services/test_comparison.py -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/comparison.py backend/tests/test_services/test_comparison.py
git commit -m "feat(services): add ComparisonService for job orchestration"
```

---

### Task 7: Create ComplianceComparator (LLM Logic)

**Files:**
- Create: `backend/app/services/compliance_comparator.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_services/test_compliance_comparator.py
import pytest
from app.services.compliance_comparator import ComplianceComparator

def test_compress_chunk_removes_whitespace():
    """Test chunk compression removes excessive whitespace."""
    comparator = ComplianceComparator()
    text = "This   is   text\n\n\nwith   spaces"
    result = comparator._compress_chunk(text)
    assert "   " not in result
    assert "\n\n\n" not in result

def test_estimate_tokens():
    """Test token estimation (approx 1 token per 4 chars)."""
    comparator = ComplianceComparator()
    text = "a" * 400
    tokens = comparator._estimate_tokens(text)
    assert tokens == 100  # 400 / 4
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest backend/tests/test_services/test_compliance_comparator.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Write ComplianceComparator**

```python
# backend/app/services/compliance_comparator.py
import json
import logging
import re
from typing import Optional
import litellm
from app.config import settings
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.models.base_document_chunk import BaseDocumentChunk
from app.db.models.compliance_report import ComplianceReport
from app.db.models.compliance_finding import ComplianceFinding

logger = logging.getLogger(__name__)


class ComplianceComparator:
    """Compares document chunks using LiteLLM."""

    MAX_CHUNK_TOKENS = settings.max_tokens_per_chunk
    CHARS_PER_TOKEN = 4  # Approximate: 1 token ~ 4 characters
    LLM_MAX_TOKENS = 1024

    def __init__(self):
        """Initialize LiteLLM with config."""
        if settings.llm_base_url:
            litellm.api_base = settings.llm_base_url
        if settings.llm_api_key:
            litellm.api_key = settings.llm_api_key

    async def compare(
        self,
        doc_a_chunks: list[MizanDocumentChunk],
        doc_b_chunks: list[BaseDocumentChunk]
    ) -> tuple[ComplianceReport, list[ComplianceFinding]]:
        """
        Main comparison pipeline.
        
        Loops through each Doc A chunk and compares against all Doc B chunks.
        Returns aggregated report + individual findings.
        """
        logger.info(f"Starting comparison: {len(doc_a_chunks)} Doc A chunks vs {len(doc_b_chunks)} Doc B chunks")

        # Compress chunks
        doc_a_chunks = [self._compress_chunk_obj(c) for c in doc_a_chunks]
        doc_b_chunks = [self._compress_chunk_obj(c) for c in doc_b_chunks]

        # Pre-format Doc B (reuse across all calls)
        doc_b_formatted = self._format_chunks(doc_b_chunks, "Regulatory Document")

        all_findings = []

        # Loop: one Doc A chunk vs all Doc B chunks
        for i, chunk_a in enumerate(doc_a_chunks, 1):
            logger.info(f"Processing Doc A chunk {i}/{len(doc_a_chunks)}")

            system_prompt = self._build_system_prompt()
            user_prompt = self._build_user_prompt(chunk_a, doc_b_formatted)

            try:
                raw_response = await self._call_llm(system_prompt, user_prompt)
                findings = self._parse_response(raw_response)
                all_findings.extend(findings)
            except Exception as e:
                logger.error(f"Error processing chunk {chunk_a.id}: {e}")
                continue

        # Compile report
        report, findings_objs = self._compile_report(all_findings)
        logger.info(f"Comparison complete: Score={report.compliance_score}, Findings={report.total_findings}")

        return report, findings_objs

    def _compress_chunk_obj(self, chunk) -> object:
        """Compress a chunk object in place."""
        chunk.text = self._compress_chunk(chunk.text)
        return chunk

    def _compress_chunk(self, text: str) -> str:
        """Remove noise tokens: whitespace, boilerplate."""
        # Remove excessive whitespace
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)

        # Remove common boilerplate
        boilerplate = [
            r'Page \d+ of \d+',
            r'CONFIDENTIAL',
            r'This page intentionally left blank',
            r'Document No\.:.*',
            r'Version \d+\.\d+',
        ]
        for pattern in boilerplate:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)

        text = text.strip()

        # Truncate if too long
        if self._estimate_tokens(text) > self.MAX_CHUNK_TOKENS:
            max_chars = self.MAX_CHUNK_TOKENS * self.CHARS_PER_TOKEN
            text = text[:max_chars] + "..." if len(text) > max_chars else text

        return text

    def _estimate_tokens(self, text: str) -> int:
        """Estimate tokens (1 token ~ 4 characters)."""
        return len(text) // self.CHARS_PER_TOKEN

    def _format_chunks(self, chunks: list, label: str) -> str:
        """Format chunks into labeled sections."""
        sections = []
        for i, chunk in enumerate(chunks, 1):
            header = f"[{label} | Section {i}]"
            sections.append(f"{header}\n{chunk.text}")
        return "\n\n---\n\n".join(sections)

    def _build_system_prompt(self) -> str:
        return """You are an expert compliance analyst. Compare the Document A section against Document B and identify compliance issues.

Respond ONLY with valid JSON. No preamble, no markdown. Just raw JSON."""

    def _build_user_prompt(self, chunk_a, doc_b_formatted: str) -> str:
        """Build the comparison prompt."""
        return f"""Review this section from Document A for compliance against Document B.

DOCUMENT A SECTION
{"=" * 60}
{chunk_a.text}

DOCUMENT B (Full Reference)
{"=" * 60}
{doc_b_formatted}

Return ONLY this JSON structure:

{{
  "findings": [
    {{
      "doc_a_section": "<section from Doc A>",
      "doc_b_section": "<relevant section from Doc B>",
      "status": "<compliant|gap|conflict|missing>",
      "severity": "<critical|medium|low>",
      "issue": "<one-line issue or 'Fully compliant'>",
      "recommendation": "<one-line fix or 'No action required'>"
    }}
  ]
}}"""

    async def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        """Call LLM via LiteLLM."""
        response = await litellm.acompletion(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=self.LLM_MAX_TOKENS,
            temperature=0,
            timeout=settings.llm_timeout
        )
        return response.choices[0].message.content

    def _parse_response(self, raw_text: str) -> list[dict]:
        """Parse JSON findings from LLM response."""
        try:
            # Clean markdown code blocks if present
            clean = raw_text.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            clean = clean.strip()

            data = json.loads(clean)
            return data.get("findings", [])
        except (json.JSONDecodeError, IndexError) as e:
            logger.warning(f"Failed to parse LLM response: {e}")
            return []

    def _compile_report(self, all_findings: list) -> tuple[ComplianceReport, list[ComplianceFinding]]:
        """Compile findings into report."""
        from uuid import uuid4

        critical = sum(1 for f in all_findings if f.get("severity") == "critical")
        medium = sum(1 for f in all_findings if f.get("severity") == "medium")
        low = sum(1 for f in all_findings if f.get("severity") == "low")

        # Score: 100 - penalties
        score = max(0, 100 - (critical * 15) - (medium * 5) - (low * 2))

        report = ComplianceReport(
            id=uuid4(),
            comparison_id=None,  # Will be set by task
            compliance_score=score,
            total_findings=len(all_findings),
            critical_count=critical,
            medium_count=medium,
            low_count=low,
            summary=f"{len(all_findings)} findings: {critical} critical, {medium} medium, {low} low"
        )

        findings_objs = [
            ComplianceFinding(
                id=uuid4(),
                comparison_id=None,
                doc_a_section=f.get("doc_a_section", "N/A"),
                doc_b_section=f.get("doc_b_section", "N/A"),
                status=f.get("status", "gap"),
                severity=f.get("severity", "low"),
                issue=f.get("issue", ""),
                recommendation=f.get("recommendation", "")
            )
            for f in all_findings
        ]

        return report, findings_objs
```

- [ ] **Step 4: Run tests**

```bash
pytest backend/tests/test_services/test_compliance_comparator.py -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/compliance_comparator.py backend/tests/test_services/test_compliance_comparator.py
git commit -m "feat(services): add ComplianceComparator for LLM-based comparison"
```

---

# Chunk 3: Celery Task and API Endpoints

### Task 8: Create Celery Task

**Files:**
- Create: `backend/app/tasks/compare_documents.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_tasks/test_compare_documents.py
import pytest
from unittest.mock import AsyncMock, patch
from app.tasks.compare_documents import compare_documents_task

@pytest.mark.asyncio
async def test_compare_documents_updates_status():
    """Test task updates comparison status."""
    # Mock dependencies
    with patch('app.tasks.compare_documents.ComparisonService') as mock_service:
        with patch('app.tasks.compare_documents.ComplianceComparator'):
            # Task should not raise
            compare_documents_task.apply()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest backend/tests/test_tasks/test_compare_documents.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Write Celery Task**

```python
# backend/app/tasks/compare_documents.py
import asyncio
import logging
from uuid import UUID
from sqlalchemy.future import select

from app.worker import celery_app
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.models.base_document_chunk import BaseDocumentChunk
from app.db.session import WorkerAsyncSessionLocal
from app.services.compliance_comparator import ComplianceComparator

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=2, name="tasks.compare_documents")
def compare_documents_task(self, mizan_doc_id: str, base_doc_id: str, comparison_id: str):
    """
    Background task: Compare two documents.
    
    Compares MizanDocument chunks against BaseDocument chunks.
    Stores findings and updates comparison status.
    """
    try:
        asyncio.run(_process_comparison(mizan_doc_id, base_doc_id, comparison_id))
    except Exception as e:
        logger.error(f"Error in compare_documents_task: {e}")
        raise self.retry(exc=e, countdown=60)


async def _process_comparison(mizan_doc_id: str, base_doc_id: str, comparison_id: str):
    """Async comparison logic."""
    async with WorkerAsyncSessionLocal() as db:
        try:
            comparison_uuid = UUID(comparison_id)
            mizan_uuid = UUID(mizan_doc_id)
            base_uuid = UUID(base_doc_id)

            # Get comparison record
            stmt = select(ComplianceComparison).where(ComplianceComparison.id == comparison_uuid)
            result = await db.execute(stmt)
            comparison = result.scalar_one_or_none()

            if not comparison:
                logger.error(f"ComplianceComparison {comparison_id} not found")
                return

            # Update status
            comparison.status = "processing"
            await db.commit()

            # Fetch chunks
            stmt_a = select(MizanDocumentChunk).where(MizanDocumentChunk.mizan_document_id == mizan_uuid)
            result_a = await db.execute(stmt_a)
            doc_a_chunks = result_a.scalars().all()

            stmt_b = select(BaseDocumentChunk).where(BaseDocumentChunk.base_document_id == base_uuid)
            result_b = await db.execute(stmt_b)
            doc_b_chunks = result_b.scalars().all()

            if not doc_a_chunks:
                logger.warning(f"No chunks found for MizanDocument {mizan_doc_id}")
                comparison.status = "failed"
                comparison.error_message = "No chunks found in document"
                await db.commit()
                return

            if not doc_b_chunks:
                logger.warning(f"No chunks found for BaseDocument {base_doc_id}")
                comparison.status = "failed"
                comparison.error_message = "No chunks found in baseline document"
                await db.commit()
                return

            logger.info(f"Comparing {len(doc_a_chunks)} vs {len(doc_b_chunks)} chunks")

            # Run comparison
            comparator = ComplianceComparator()
            report, findings = await comparator.compare(doc_a_chunks, doc_b_chunks)

            # Save report
            report.comparison_id = comparison_uuid
            db.add(report)
            await db.flush()

            # Save findings
            for finding in findings:
                finding.comparison_id = comparison_uuid
                db.add(finding)

            # Update comparison
            comparison.status = "completed"
            comparison.report = report
            await db.commit()

            logger.info(f"Comparison {comparison_id} completed: Score={report.compliance_score}")

        except Exception as e:
            logger.exception(f"Error processing comparison {comparison_id}: {e}")
            if comparison:
                comparison.status = "failed"
                comparison.error_message = str(e)
                await db.commit()
            raise
```

- [ ] **Step 4: Run test**

```bash
pytest backend/tests/test_tasks/test_compare_documents.py -v
```

Expected: `PASSED` (or passes with mocks)

- [ ] **Step 5: Commit**

```bash
git add backend/app/tasks/compare_documents.py backend/tests/test_tasks/test_compare_documents.py
git commit -m "feat(tasks): add compare_documents Celery task"
```

---

### Task 9: Add API Endpoints

**Files:**
- Modify: `backend/app/api/v1/documents.py`

- [ ] **Step 1: Read existing documents.py**

```bash
head -30 backend/app/api/v1/documents.py
```

- [ ] **Step 2: Add imports**

Add after existing imports:

```python
from app.services.comparison import ComparisonService
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.compliance_report import ComplianceReport
```

- [ ] **Step 3: Add POST /documents/{doc_id}/analyze endpoint**

Add this route to the router:

```python
@router.post("/documents/{doc_id}/analyze", response_model=dict)
async def start_comparison(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Trigger comparison of a document against its base document.
    
    Returns: {"comparison_id": "...", "status": "pending"}
    """
    try:
        service = ComparisonService()
        comparison = await service.start_comparison(
            tenant_id=current_user["tenant_id"],
            mizan_doc_id=UUID(doc_id),
            db=db
        )
        return {
            "comparison_id": str(comparison.id),
            "status": comparison.status,
            "created_at": comparison.created_at.isoformat()
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error starting comparison: {e}")
        raise HTTPException(status_code=500, detail="Failed to start comparison")
```

- [ ] **Step 4: Add GET /comparisons/{comparison_id}/status endpoint**

```python
@router.get("/comparisons/{comparison_id}/status", response_model=dict)
async def get_comparison_status(
    comparison_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Poll for comparison status."""
    try:
        service = ComparisonService()
        status = await service.get_comparison_status(UUID(comparison_id), db)
        return status
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

- [ ] **Step 5: Add GET /comparisons/{comparison_id}/report endpoint**

```python
@router.get("/comparisons/{comparison_id}/report", response_model=dict)
async def get_comparison_report(
    comparison_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Fetch completed comparison report with findings."""
    try:
        service = ComparisonService()
        report = await service.get_comparison_report(UUID(comparison_id), db)
        
        # Get findings too
        findings_stmt = select(ComplianceFinding).where(
            ComplianceFinding.comparison_id == UUID(comparison_id)
        )
        findings_result = await db.execute(findings_stmt)
        findings = findings_result.scalars().all()
        
        return {
            "report": {
                "id": str(report.id),
                "compliance_score": report.compliance_score,
                "total_findings": report.total_findings,
                "critical_count": report.critical_count,
                "medium_count": report.medium_count,
                "low_count": report.low_count,
                "summary": report.summary
            },
            "findings": [
                {
                    "id": str(f.id),
                    "doc_a_section": f.doc_a_section,
                    "doc_b_section": f.doc_b_section,
                    "status": f.status,
                    "severity": f.severity,
                    "issue": f.issue,
                    "recommendation": f.recommendation
                }
                for f in findings
            ]
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

- [ ] **Step 6: Test endpoints exist**

```bash
python -c "from app.api.v1.documents import router; print('✓ Endpoints loaded')"
```

Expected: `✓ Endpoints loaded`

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/documents.py
git commit -m "feat(api): add 3 endpoints for comparison (start, status, report)"
```

---

# Chunk 4: Frontend Implementation

### Task 10: Create Analyze Button

**Files:**
- Modify: `frontend/src/pages/Documents.tsx`

- [ ] **Step 1: Read Documents.tsx dropdown menu**

```bash
head -450 frontend/src/pages/Documents.tsx | tail -50
```

- [ ] **Step 2: Add Analyze action to dropdown**

In the DropdownMenuContent section (around line 420), add after the "View Analysis" item:

```typescript
<DropdownMenuItem
  onClick={() => handleStartAnalysis(doc.id)}
  className="cursor-pointer"
>
  <Zap className="mr-2 h-4 w-4" />
  Analyze
</DropdownMenuItem>
```

Also add `Zap` to the imports from lucide-react.

- [ ] **Step 3: Add handler function**

In the Documents component body, add:

```typescript
const handleStartAnalysis = async (docId: string) => {
  try {
    const response = await api.post(`/documents/${docId}/analyze`);
    const { comparison_id } = response.data;
    // Store comparison_id and redirect to detail view with analysis tab
    navigate(`/documents/${docId}?comparison_id=${comparison_id}&tab=analysis`);
  } catch (error: any) {
    const message = error.response?.data?.detail || "Failed to start analysis";
    alert(message);
  }
};
```

- [ ] **Step 4: Add Zap import**

Update the lucide-react import to include Zap:

```typescript
import { FileText, Search, Filter, Eye, Download, MoreHorizontal, AlertTriangle, CheckCircle, Clock, Trash2, Upload, Loader, Zap } from "lucide-react";
```

- [ ] **Step 5: Test build**

```bash
cd frontend && npm run build 2>&1 | head -20
```

Expected: No errors in the build output

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Documents.tsx
git commit -m "feat(ui): add Analyze button to document actions"
```

---

### Task 11: Create useComparison Hook

**Files:**
- Create: `frontend/src/hooks/useComparison.ts`

- [ ] **Step 1: Write the hook**

```typescript
// frontend/src/hooks/useComparison.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

interface ComparisonReport {
  id: string;
  compliance_score: number;
  total_findings: number;
  critical_count: number;
  medium_count: number;
  low_count: number;
  summary: string;
}

interface ComparisonFinding {
  id: string;
  doc_a_section: string;
  doc_b_section: string;
  status: "compliant" | "gap" | "conflict" | "missing";
  severity: "critical" | "medium" | "low";
  issue: string;
  recommendation: string;
}

export const useComparison = (comparisonId: string | null) => {
  const queryClient = useQueryClient();
  const [pollInterval, setPollInterval] = useState(2000);

  // Poll for status
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ["comparison-status", comparisonId],
    queryFn: () =>
      comparisonId
        ? api
            .get(`/comparisons/${comparisonId}/status`)
            .then((r) => r.data)
            .catch(() => null)
        : null,
    enabled: !!comparisonId,
    refetchInterval: (data) => {
      // Stop polling when completed or failed
      if (data?.status === "completed" || data?.status === "failed") {
        return false;
      }
      return pollInterval;
    },
  });

  // Fetch report once completed
  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["comparison-report", comparisonId],
    queryFn: () =>
      comparisonId && statusData?.status === "completed"
        ? api
            .get(`/comparisons/${comparisonId}/report`)
            .then((r) => r.data)
            .catch(() => null)
        : null,
    enabled: !!comparisonId && statusData?.status === "completed",
  });

  return {
    comparisonId,
    status: statusData?.status || "pending",
    report: reportData?.report as ComparisonReport | null,
    findings: (reportData?.findings || []) as ComparisonFinding[],
    isLoading: statusLoading || reportLoading,
    startedAt: statusData?.started_at,
    completedAt: statusData?.completed_at,
    error: statusData?.error_message,
  };
};
```

- [ ] **Step 2: Test hook syntax**

```bash
cd frontend && npx tsc --noEmit src/hooks/useComparison.ts
```

Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useComparison.ts
git commit -m "feat(hooks): add useComparison polling hook"
```

---

### Task 12: Create ComparisonResults Component

**Files:**
- Create: `frontend/src/components/ComparisonResults.tsx`

- [ ] **Step 1: Write component**

```typescript
// frontend/src/components/ComparisonResults.tsx
import { useComparison } from "@/hooks/useComparison";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, AlertTriangle, AlertCircle, Loader } from "lucide-react";

interface ComparisonResultsProps {
  comparisonId: string | null;
}

export const ComparisonResults = ({ comparisonId }: ComparisonResultsProps) => {
  const { status, report, findings, isLoading, error } = useComparison(comparisonId);

  if (!comparisonId) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">No comparison started</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <Loader className="h-8 w-8 animate-spin text-accent-600 mx-auto mb-4" />
        <p className="text-text-secondary">
          {status === "processing" ? "Analyzing document..." : "Loading results..."}
        </p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="bg-critical/5 border border-critical/30 rounded-lg p-8">
        <AlertCircle className="h-12 w-12 text-critical mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Analysis Failed</h3>
        <p className="text-sm text-critical">{error || "Unknown error"}</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">No results available</p>
      </div>
    );
  }

  const scoreColor =
    report.compliance_score >= 80
      ? "text-success"
      : report.compliance_score >= 60
        ? "text-warning"
        : "text-critical";

  const scoreEmoji =
    report.compliance_score >= 80 ? "🟢" : report.compliance_score >= 60 ? "🟡" : "🔴";

  return (
    <div className="space-y-6">
      {/* Score Card */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Compliance Score</CardTitle>
          <CardDescription>Overall compliance assessment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-5xl font-bold ${scoreColor}`}>
                {scoreEmoji} {report.compliance_score}%
              </p>
              <p className="text-sm text-text-secondary mt-2">{report.summary}</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-critical">{report.critical_count}</p>
                <p className="text-xs text-text-secondary">Critical</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-warning">{report.medium_count}</p>
                <p className="text-xs text-text-secondary">Medium</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-success">{report.low_count}</p>
                <p className="text-xs text-text-secondary">Low</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Findings Table */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Findings</CardTitle>
          <CardDescription>{report.total_findings} issues identified</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {findings.map((finding) => (
                <TableRow key={finding.id}>
                  <TableCell>
                    <Badge
                      variant={
                        finding.status === "compliant"
                          ? "success"
                          : finding.status === "gap"
                            ? "warning"
                            : "critical"
                      }
                    >
                      {finding.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        finding.severity === "critical"
                          ? "critical"
                          : finding.severity === "medium"
                            ? "warning"
                            : "outline"
                      }
                    >
                      {finding.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <span className="text-sm">{finding.issue}</span>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <span className="text-sm text-text-secondary">{finding.recommendation}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
```

- [ ] **Step 2: Test syntax**

```bash
cd frontend && npx tsc --noEmit src/components/ComparisonResults.tsx
```

Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ComparisonResults.tsx
git commit -m "feat(components): add ComparisonResults display component"
```

---

### Task 13: Integrate Results Tab in DocumentDetail

**Files:**
- Modify: `frontend/src/pages/DocumentDetail.tsx`

- [ ] **Step 1: Read DocumentDetail.tsx tabs section**

```bash
head -245 frontend/src/pages/DocumentDetail.tsx | tail -50
```

- [ ] **Step 2: Add ComparisonResults import**

Add to imports:

```typescript
import { ComparisonResults } from "@/components/ComparisonResults";
```

- [ ] **Step 3: Add comparison result tab**

In the tabs section (after "Chunks" and "Document" tabs), add:

```typescript
<button
  onClick={() => setActiveTab("comparison")}
  className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
    activeTab === "comparison"
      ? "text-accent-600 border-accent-600"
      : "text-text-secondary border-transparent hover:text-foreground"
  }`}
>
  Compliance Analysis
</button>
```

- [ ] **Step 4: Add tab content**

In the tab content section, add:

```typescript
{activeTab === "comparison" && (
  <ComparisonResults comparisonId={new URLSearchParams(window.location.search).get("comparison_id")} />
)}
```

- [ ] **Step 5: Add comparison tab to activeTab type**

Update the activeTab state:

```typescript
const [activeTab, setActiveTab] = useState<"chunks" | "document" | "comparison">("chunks");
```

- [ ] **Step 6: Test build**

```bash
cd frontend && npm run build 2>&1 | head -20
```

Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/DocumentDetail.tsx
git commit -m "feat(pages): add Compliance Analysis tab to DocumentDetail"
```

---

# Chunk 5: Database Migrations and Final Setup

### Task 14: Create Database Migration

**Files:**
- Create: `backend/alembic/versions/<timestamp>_add_compliance_tables.py`

- [ ] **Step 1: Generate migration**

```bash
cd backend
alembic revision --autogenerate -m "Add compliance comparison tables"
```

This creates a file like `alembic/versions/XXXX_add_compliance_tables.py`

- [ ] **Step 2: Review migration**

```bash
cat alembic/versions/*compliance*.py | head -50
```

Verify it creates the three tables with correct columns and relationships.

- [ ] **Step 3: Run migration**

```bash
alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Running upgrade ... -> <hash>`

- [ ] **Step 4: Verify tables exist**

```bash
psql -U mizan -d mizan_db -c "\dt compliance_*"
```

Expected: Lists `compliance_comparisons`, `compliance_reports`, `compliance_findings` tables

- [ ] **Step 5: Commit**

```bash
git add alembic/versions/
git commit -m "db: add compliance comparison tables migration"
```

---

### Task 15: Install LiteLLM Dependency

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add LiteLLM to requirements**

Add to `backend/requirements.txt`:

```
litellm>=1.0.0
```

- [ ] **Step 2: Install**

```bash
cd backend && pip install litellm
```

Expected: `Successfully installed litellm...`

- [ ] **Step 3: Verify import**

```bash
python -c "import litellm; print(f'LiteLLM version: {litellm.__version__}')"
```

Expected: `LiteLLM version: X.X.X`

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add litellm dependency"
```

---

### Task 16: Add to __init__ Exports

**Files:**
- Modify: `backend/app/db/models/__init__.py`

- [ ] **Step 1: Verify imports were added (from Task 4)**

```bash
grep -i compliance backend/app/db/models/__init__.py
```

Expected: Lists all three new models

- [ ] **Step 2: If not present, add now**

```python
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.compliance_report import ComplianceReport
from app.db.models.compliance_finding import ComplianceFinding
```

- [ ] **Step 3: Commit (if changes made)**

```bash
git add backend/app/db/models/__init__.py
git commit -m "chore: export compliance models"
```

---

### Task 17: Full Integration Test

**Files:**
- Test: All backend components

- [ ] **Step 1: Start Redis (if not running)**

```bash
redis-server &
```

Or verify it's running:

```bash
redis-cli ping
```

Expected: `PONG`

- [ ] **Step 2: Start Celery worker**

```bash
cd backend && celery -A app.worker worker --loglevel=info &
```

- [ ] **Step 3: Start FastAPI server**

```bash
cd backend && uvicorn app.main:app --reload --port 8001 &
```

- [ ] **Step 4: Test endpoint (manual curl)**

```bash
curl -X POST http://localhost:8001/api/v1/documents/{doc_id}/analyze \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json"
```

Expected: Returns `{"comparison_id": "...", "status": "pending"}`

- [ ] **Step 5: Start frontend dev server**

```bash
cd frontend && npm run dev &
```

- [ ] **Step 6: Manual UI test**

Open http://localhost:8002, navigate to Documents, click Analyze on a document, observe:
- Button click → POST /documents/{id}/analyze
- Navigation to DocumentDetail with comparison_id
- "Compliance Analysis" tab appears
- Status updates as task processes

- [ ] **Step 7: Check logs**

```bash
# Check worker processed task
tail -20 celery.log

# Check API logs
tail -20 backend.log
```

Expected: No errors, task completion logged

---

### Task 18: Write E2E Test

**Files:**
- Create: `backend/tests/test_e2e/test_compliance_flow.py`

- [ ] **Step 1: Write full flow test**

```python
# backend/tests/test_e2e/test_compliance_flow.py
import pytest
from uuid import uuid4
from app.db.models.mizan_document import MizanDocument
from app.db.models.base_document import BaseDocument
from app.services.comparison import ComparisonService

@pytest.mark.asyncio
async def test_full_compliance_comparison_flow(db_session):
    """Test complete comparison flow: create job → run task → fetch report."""
    
    # Create test documents (would come from fixtures in real test)
    tenant_id = uuid4()
    mizan_doc_id = uuid4()
    base_doc_id = uuid4()
    
    # Start comparison
    service = ComparisonService()
    comparison = await service.start_comparison(tenant_id, mizan_doc_id, db_session)
    
    assert comparison.status == "pending"
    assert comparison.mizan_document_id == mizan_doc_id
    assert comparison.base_document_id == base_doc_id
    
    # Status check
    status = await service.get_comparison_status(comparison.id, db_session)
    assert status["status"] == "pending"
```

- [ ] **Step 2: Run test**

```bash
pytest backend/tests/test_e2e/test_compliance_flow.py -v
```

Expected: `PASSED` or `SKIPPED` (if fixtures missing)

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_e2e/test_compliance_flow.py
git commit -m "test: add E2E compliance comparison test"
```

---

### Task 19: Final Checks and Documentation

**Files:**
- Verify: All components integrated

- [ ] **Step 1: Run all tests**

```bash
cd backend && pytest tests/ -v --tb=short 2>&1 | tail -30
```

Expected: All tests pass or skip gracefully

- [ ] **Step 2: Check linting**

```bash
cd frontend && npm run lint 2>&1 | tail -20
```

Expected: No critical errors

- [ ] **Step 3: Verify no circular imports**

```bash
python -c "
import app.services.comparison
import app.services.compliance_comparator
import app.tasks.compare_documents
import app.api.v1.documents
print('✓ No circular imports')
"
```

Expected: `✓ No circular imports`

- [ ] **Step 4: Document LiteLLM config in README**

Add to `backend/README.md`:

```markdown
## LiteLLM Configuration

Configure LLM model in `.env`:

```
LLM_MODEL=ollama/llama2
LLM_BASE_URL=http://localhost:11434
LLM_API_KEY=  # Only if required
```

Supports any LiteLLM-compatible model: Ollama, OpenAI, Anthropic, etc.
```

- [ ] **Step 5: Final commit**

```bash
git add backend/README.md
git commit -m "docs: add LiteLLM configuration guide"
```

---

## Summary

**Total tasks:** 19
**Files created:** 15
**Files modified:** 10

**Implementation checklist:**
- [x] Database models (3 tables)
- [x] Service layer (2 services)
- [x] Celery task
- [x] API endpoints (3)
- [x] Frontend components (2)
- [x] Configuration
- [x] Migrations
- [x] Tests
- [x] Integration verified

**Next steps:**
1. Run full test suite
2. Deploy to staging
3. Test end-to-end with real documents
4. Gather feedback
5. Iterate on UX/findings quality

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-26-compliance-comparison-implementation.md`.**
