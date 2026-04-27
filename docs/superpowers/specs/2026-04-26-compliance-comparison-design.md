# Compliance Comparison Feature — Design Specification

**Goal:** Build a compliance comparison layer that compares user-uploaded documents (MizanDocument) against regulatory/policy documents (BaseDocument) using LiteLLM, generating structured findings about gaps, conflicts, and missing clauses.

**Architecture:** Service-based (Approach B) — separate service layer, Celery task orchestration, LiteLLM for LLM calls, database persistence following Noesia job polling pattern.

**Tech Stack:** FastAPI, Celery, SQLAlchemy async, PostgreSQL, LiteLLM Python SDK

---

## 1. Data Models

Three new SQLAlchemy models (async ORM, following existing patterns):

### `app/db/models/compliance_comparison.py`
```python
class ComplianceComparison(Base):
    """Job tracking for document comparison (like Noesia jobs)."""
    __tablename__ = "compliance_comparisons"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), FK("tenants.id", ondelete="CASCADE"))
    mizan_document_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), FK("mizan_documents.id", ondelete="CASCADE"))
    base_document_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), FK("base_documents.id", ondelete="CASCADE"))
    
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

### `app/db/models/compliance_report.py`
```python
class ComplianceReport(Base):
    """Aggregated compliance findings for a comparison."""
    __tablename__ = "compliance_reports"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    comparison_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), FK("compliance_comparisons.id", ondelete="CASCADE"), unique=True)
    
    compliance_score: Mapped[int] = mapped_column(Integer, default=0)  # 0-100
    total_findings: Mapped[int] = mapped_column(Integer, default=0)
    critical_count: Mapped[int] = mapped_column(Integer, default=0)
    medium_count: Mapped[int] = mapped_column(Integer, default=0)
    low_count: Mapped[int] = mapped_column(Integer, default=0)
    
    missing_in_doc_a: Mapped[list] = mapped_column(JSONB, default=list)  # BaseDoc sections not in MizanDoc
    missing_in_doc_b: Mapped[list] = mapped_column(JSONB, default=list)  # MizanDoc sections not in BaseDoc
    summary: Mapped[str] = mapped_column(Text, default="")
    raw_response: Mapped[dict] = mapped_column(JSONB, default=dict)  # Full LLM response for debugging
    
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
    
    comparison: Mapped["ComplianceComparison"] = relationship(back_populates="report")
```

### `app/db/models/compliance_finding.py`
```python
class ComplianceFinding(Base):
    """Individual compliance findings from comparison."""
    __tablename__ = "compliance_findings"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    comparison_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), FK("compliance_comparisons.id", ondelete="CASCADE"))
    
    doc_a_section: Mapped[str] = mapped_column(String(500))  # Section from MizanDocument
    doc_b_section: Mapped[str] = mapped_column(String(500))  # Section from BaseDocument
    status: Mapped[str] = mapped_column(String(30))  # compliant|gap|conflict|missing
    severity: Mapped[str] = mapped_column(String(30))  # critical|medium|low
    issue: Mapped[str] = mapped_column(Text)  # One-line description
    recommendation: Mapped[str] = mapped_column(Text)  # One-line recommendation
    
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    
    comparison: Mapped["ComplianceComparison"] = relationship(back_populates="findings")
```

Update `MizanDocument` and `BaseDocument` to add relationships:
```python
# In MizanDocument
comparisons: Mapped[list["ComplianceComparison"]] = relationship(back_populates="mizan_document", cascade="all, delete-orphan")

# In BaseDocument  
comparisons: Mapped[list["ComplianceComparison"]] = relationship(back_populates="base_document", cascade="all, delete-orphan")
```

---

## 2. Service Layer

### `app/services/comparison.py` — Orchestration
```python
class ComparisonService:
    """Orchestrates document comparison pipeline."""
    
    async def start_comparison(self, tenant_id: UUID, mizan_doc_id: UUID) -> ComplianceComparison:
        """Create comparison job and enqueue Celery task."""
        # Get MizanDocument and its base_document_id
        # Create ComplianceComparison record (status=pending)
        # Enqueue compare_documents_task(mizan_doc_id, base_doc_id)
        # Return comparison record
    
    async def get_comparison_status(self, comparison_id: UUID) -> dict:
        """Return current status for polling."""
        # Return: {"status": "processing", "started_at": ..., "completed_at": ...}
    
    async def get_comparison_report(self, comparison_id: UUID) -> ComplianceReport:
        """Fetch completed report with all findings."""
```

### `app/services/compliance_comparator.py` — LLM Comparison Logic
```python
class ComplianceComparator:
    """Compares chunks using LiteLLM."""
    
    async def compare(self, 
                     doc_a_chunks: list[MizanDocumentChunk],
                     doc_b_chunks: list[BaseDocumentChunk]) -> ComplianceReport:
        """
        Main comparison:
        1. Compress chunks (remove noise, limit tokens)
        2. Pre-format all Doc B chunks (reuse across calls)
        3. For each Doc A chunk:
           - Send [1 chunk] + [all Doc B chunks] to LiteLLM
           - Parse JSON response
           - Store findings
        4. Compile report (score, counts, summary)
        """
    
    async def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        """Call model via LiteLLM SDK."""
        # Use litellm.acompletion() with configured model from env
    
    def _compress_chunk(self, text: str) -> str:
        """Remove boilerplate, trim to max tokens."""
    
    def _build_prompts(self, chunk_a: MizanDocumentChunk, chunks_b: list) -> tuple:
        """Build system + user prompts following solution plan."""
    
    def _parse_response(self, raw_text: str) -> list[dict]:
        """Parse JSON findings from LLM response."""
```

---

## 3. Celery Task

### `app/tasks/compare_documents.py`
```python
@celery_app.task(bind=True, max_retries=2, name="tasks.compare_documents")
def compare_documents_task(self, mizan_doc_id: str, base_doc_id: str):
    """
    Background task: Compare two documents.
    
    Flow:
    1. Update ComplianceComparison.status = "processing"
    2. Fetch chunks from DB
    3. Call ComplianceComparator.compare()
    4. Store ComplianceReport + ComplianceFindings
    5. Update ComplianceComparison.status = "completed"
    
    On error: Update status = "failed", set error_message
    """
    asyncio.run(_process_comparison(mizan_doc_id, base_doc_id))

async def _process_comparison(mizan_doc_id: str, base_doc_id: str):
    """Async logic."""
    # Get comparison record, chunks
    # Execute comparison
    # Store results
```

---

## 4. API Endpoint

### `app/api/v1/documents.py` (add route)
```python
@router.post("/documents/{doc_id}/analyze")
async def start_comparison(doc_id: str, session: AsyncSession, current_user):
    """
    Trigger comparison of a document against its base_document.
    
    Returns: {"comparison_id": "...", "status": "pending"}
    """
    service = ComparisonService()
    comparison = await service.start_comparison(
        tenant_id=current_user.tenant_id,
        mizan_doc_id=UUID(doc_id)
    )
    return {"comparison_id": str(comparison.id), "status": comparison.status}

@router.get("/comparisons/{comparison_id}/status")
async def get_comparison_status(comparison_id: str, session: AsyncSession, current_user):
    """Poll for comparison status."""
    service = ComparisonService()
    comparison = await service.get_comparison_status(UUID(comparison_id))
    return comparison

@router.get("/comparisons/{comparison_id}/report")
async def get_comparison_report(comparison_id: str, session: AsyncSession, current_user):
    """Fetch completed comparison report with findings."""
    service = ComparisonService()
    report = await service.get_comparison_report(UUID(comparison_id))
    return report
```

---

## 5. Frontend Integration

### Add "Analyze" button to Documents.tsx actions dropdown
```typescript
<DropdownMenuItem onClick={() => handleAnalyze(doc.id)}>
  <Zap className="mr-2 h-4 w-4" />
  Analyze
</DropdownMenuItem>
```

### Create `useComparison` hook for polling
```typescript
const { comparisonId, status, report, isLoading } = useComparison(docId);

// Polls GET /comparisons/{id}/status until completed
// Then fetches GET /comparisons/{id}/report
```

### Create `ComparisonResults` component
```typescript
// Show in DocumentDetail.tsx as new tab: "Compliance Analysis"
// Display: score, findings table (status/severity/issue/recommendation)
// Filter by severity
```

---

## 6. Configuration

### `.env` additions
```
# LiteLLM configuration
LLM_MODEL=ollama/llama2  # or openai/gpt-4, anthropic/claude-3, etc.
LLM_API_KEY=optional_if_needed
LLM_BASE_URL=http://localhost:11434  # For local models (Ollama)

# Comparison settings
MAX_TOKENS_PER_CHUNK=400
COMPARISON_TIMEOUT_SECONDS=600
```

### `app/config.py` update
```python
llm_model: str = Field(default="ollama/llama2")
llm_api_key: str | None = None
llm_base_url: str | None = None
max_tokens_per_chunk: int = 400
comparison_timeout: int = 600
```

---

## 7. Process Flow

```
User clicks "Analyze" on document in Documents table
    ↓
POST /documents/{id}/analyze
    ↓
ComparisonService.start_comparison()
  - Create ComplianceComparison (status=pending)
  - Enqueue Celery task
  - Return comparison_id
    ↓
Frontend polls GET /comparisons/{id}/status every 2s
    ↓
Celery Worker executes compare_documents_task()
  - Update status=processing
  - Fetch MizanDocument chunks + BaseDocument chunks
  - Call ComplianceComparator.compare()
    • Compress chunks
    • Pre-format BaseDoc
    • Loop Doc A chunks:
      • Call LiteLLM (1 Doc A + all Doc B)
      • Parse findings
    • Compile report
  - Store ComplianceReport + ComplianceFindings in DB
  - Update ComplianceComparison status=completed
    ↓
Frontend detects status=completed
    ↓
GET /comparisons/{id}/report
    ↓
Display ComparisonResults tab in DocumentDetail:
  - Compliance score (0-100)
  - Findings by severity (critical/medium/low)
  - Table: Section | Status | Issue | Recommendation
  - Missing sections in each doc
```

---

## 8. Token Budget (per solution plan)

```
1 Doc A chunk           ~300 tokens
All 50 Doc B chunks     ~15,000 tokens
Prompt instructions     ~300 tokens
─────────────────────────────────
Total per call:         ~15,600 tokens

Safe for: Ollama, Mistral, Llama2, small models (8K-32K context)
```

---

## 9. Testing Strategy

- Unit tests: `ComplianceComparator._compress_chunk()`, `_parse_response()`
- Integration tests: Full comparison pipeline with mock LLM
- E2E: Upload doc, click Analyze, poll, verify report saved

---

## Files to Create/Modify

**Create:**
- `app/db/models/compliance_comparison.py`
- `app/db/models/compliance_report.py`
- `app/db/models/compliance_finding.py`
- `app/services/comparison.py`
- `app/services/compliance_comparator.py`
- `app/tasks/compare_documents.py`
- `frontend/src/hooks/useComparison.ts`
- `frontend/src/components/ComparisonResults.tsx`

**Modify:**
- `app/db/models/document.py` (add relationships)
- `app/db/models/base_document.py` (add relationships)
- `app/api/v1/documents.py` (add endpoints)
- `app/config.py` (add LiteLLM settings)
- `frontend/src/pages/Documents.tsx` (add Analyze button)
- `frontend/src/pages/DocumentDetail.tsx` (add tab)

---

**This design is complete, follows Mizan patterns, reuses Noesia polling architecture, and is ready for implementation.**
