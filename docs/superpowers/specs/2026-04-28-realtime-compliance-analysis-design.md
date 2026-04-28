# Real-Time Compliance Analysis Progress + Final Results Page Design

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time progress tracking to compliance analysis jobs and redesign the final results page to show section-by-section compliance with proper formatting.

**Architecture:** Enhance the backend status endpoint to include progress details (current chunk, total chunks, estimated completion time), poll every 2 seconds on the frontend, and display both a progress page during processing and a formatted results page when complete.

**Tech Stack:** FastAPI (backend), React + React Query (frontend), Tailwind CSS, shadcn/ui components

---

## Overview

Users currently see a blank page while compliance analysis runs (5-10 minutes), with no feedback. This design adds:
1. **Real-time progress indicator** showing which chunk is being analyzed and estimated time remaining
2. **Progress bar** calculating percentage from current_chunk / total_chunks
3. **Final results page** matching professional compliance analysis layout with clause-by-clause breakdown

---

## Current State

**Backend (`compare_documents_task`):**
- Runs compliance comparison asynchronously
- Stores results in ComplianceReport and ComplianceFinding tables
- Status endpoint returns: `{status, started_at, completed_at, error_message}`
- Does NOT track progress during processing

**Frontend:**
- ComparisonResults component shows results OR processing spinner
- ComplianceAnalysisView page shows results OR "No Analysis Yet"
- Polls `/documents/comparisons/{id}/status` every 2 seconds
- No progress indication while job runs

**Problem:** Users see blank "Loading report..." or "No results available" for entire 5-10 minute duration

---

## Solution: Three Components

### 1. Backend Enhancement: Progress Tracking

**File:** `backend/app/tasks/compare_documents.py`

Add progress tracking to `_compare_documents_impl()`:
```python
# Before comparison loop
comparison.current_chunk = 0
comparison.total_chunks = len(doc_a_chunks) + len(doc_b_chunks)
await db.commit()

# In comparison loop (as chunks are processed)
comparison.current_chunk += 1
if comparison.current_chunk % 5 == 0:  # Update DB every 5 chunks for efficiency
    await db.commit()
```

**File:** `backend/app/db/models/compliance_comparison.py`

Add columns to ComplianceComparison model:
```python
current_chunk: Mapped[int] = mapped_column(Integer, default=0)
total_chunks: Mapped[int] = mapped_column(Integer, default=0)
```

**File:** `backend/app/api/v1/documents.py`

Update status endpoint response to include progress:
```python
@router.get("/comparisons/{comparison_id}/status", response_model=dict)
async def get_comparison_status(...):
    status = await service.get_comparison_status(comp_uuid, db)
    # Add current_chunk, total_chunks, estimated_completion
    if status.status == "processing" and status.total_chunks > 0:
        elapsed = (datetime.utcnow() - status.started_at).total_seconds()
        chunk_rate = status.current_chunk / elapsed if elapsed > 0 else 0
        remaining_chunks = status.total_chunks - status.current_chunk
        estimated_seconds = remaining_chunks / chunk_rate if chunk_rate > 0 else 60
        status.estimated_completion = datetime.utcnow() + timedelta(seconds=estimated_seconds)
    
    return {
        "status": status.status,
        "current_chunk": status.current_chunk,
        "total_chunks": status.total_chunks,
        "started_at": status.started_at.isoformat(),
        "completed_at": status.completed_at.isoformat() if status.completed_at else None,
        "estimated_completion": status.estimated_completion.isoformat() if status.estimated_completion else None,
        "error_message": status.error_message,
    }
```

---

### 2. Frontend: Progress UI Component

**File:** `frontend/src/components/ProgressIndicator.tsx` (NEW)

Component that displays while `status === "processing"`:
```typescript
interface ProgressIndicatorProps {
  currentChunk: number;
  totalChunks: number;
  startedAt: string;
  estimatedCompletion: string;
}

export function ProgressIndicator({ currentChunk, totalChunks, startedAt, estimatedCompletion }: ProgressIndicatorProps) {
  const percentage = Math.round((currentChunk / totalChunks) * 100);
  const elapsedSeconds = (Date.now() - new Date(startedAt).getTime()) / 1000;
  const estimatedSeconds = (new Date(estimatedCompletion).getTime() - Date.now()) / 1000;
  
  return (
    <Card className="border-0 bg-slate-900/50">
      <CardContent className="pt-8 space-y-6">
        {/* Progress Bar */}
        <div>
          <div className="flex justify-between mb-2">
            <p className="text-slate-400 font-medium">Analysis in progress...</p>
            <p className="text-slate-400 font-medium">{percentage}%</p>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
        
        {/* Chunk Info */}
        <div className="text-center">
          <p className="text-slate-300">Chunk {currentChunk} of {totalChunks}</p>
          <p className="text-xs text-slate-500 mt-1">
            Elapsed: {formatTime(elapsedSeconds)} • Est. remaining: {formatTime(estimatedSeconds)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

### 3. Frontend: Results Page Enhancement

**File:** `frontend/src/pages/ComplianceAnalysisResults.tsx` (NEW or modify existing)

When `status === "completed"`, display:
- Document header with title, file info
- Overview section: Compliance score (%), Total clauses, Issues found
- Clause-by-clause breakdown:
  - Clause name
  - Status badge (Compliant ✓ / Issues ✗)
  - Confidence percentage
  - Details expandable
- AI Assistant panel on right side

Structure in JSON format:
```json
{
  "document": {
    "id": "string",
    "name": "Employment_Contract_v2.pdf",
    "type": "Contract",
    "size": "2.3 MB",
    "uploaded": "2026-01-15"
  },
  "overview": {
    "compliance_score": 94,
    "total_clauses": 3,
    "issues_found": 0,
    "compliant_clauses": 3,
    "needs_review": 0,
    "critical_issues": 0
  },
  "clauses": [
    {
      "id": "clause_1",
      "name": "Termination Clause",
      "status": "compliant",
      "confidence": 95,
      "summary": "..."
    },
    {
      "id": "clause_2",
      "name": "Compensation Terms",
      "status": "compliant",
      "confidence": 92,
      "summary": "..."
    }
  ]
}
```

---

## Data Flow

1. User clicks "Analyze" → POST `/documents/{id}/analyze`
2. Backend creates ComplianceComparison with status="pending"
3. Celery task starts, initializes current_chunk=0, total_chunks=19
4. Frontend navigates to results page, starts polling `/documents/comparisons/{id}/status`
5. Every 2 seconds:
   - Get status with `current_chunk`, `total_chunks`, `estimated_completion`
   - Display ProgressIndicator with updated percentage
   - When status==="completed", fetch report and show results page
6. Final page shows complete analysis with clause breakdown

---

## Error Handling

- If status==="failed": Show error message from backend
- If estimated_completion is in past: Show "Almost done..."
- If total_chunks=0: Show percentage as 0%, message "Initializing..."

---

## Testing

1. Start a new analysis and verify progress bar updates
2. Verify chunk counter increments every 2 seconds
3. Verify time estimates are reasonable (elapsed + remaining = total)
4. Verify final page loads and displays all clauses with status badges
5. Test error scenarios: cancel job, backend error, network timeout

---

## Success Criteria

- ✅ Progress bar visible and updating during analysis
- ✅ Chunk counter shows "X of Y" format
- ✅ Elapsed time and estimated remaining time display correctly
- ✅ Final results page matches screenshot design
- ✅ Clause-by-clause breakdown shows compliance status badges
- ✅ AI Assistant panel available on results page
- ✅ No blank pages or "No results available" during processing
- ✅ Progress updates every 2 seconds without lag
