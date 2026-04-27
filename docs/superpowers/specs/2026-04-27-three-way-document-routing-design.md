# Three-Way Document Action Routing Design

**Date:** 2026-04-27  
**Status:** Approved  
**Scope:** Add "Document Details" menu option and create separate compliance analysis view page

---

## Overview

The Documents list currently has two menu options ("View Analysis" and "Analyze") that both navigate to the same DocumentDetail page, creating confusion. Users need three distinct workflows:

1. **View document content** — See the document itself (chunks, extracted content)
2. **View compliance analysis** — See the compliance report (score, findings, recommendations)
3. **Start new analysis** — Trigger a compliance comparison job

---

## Current State

**Documents.tsx dropdown menu (lines 432-445):**
- "View Analysis" → `navigate(/documents/{id})` → DocumentDetail page
- "Analyze" → `handleStartAnalysis()` → POST `/documents/{id}/analyze` → `navigate(/documents/{id}?tab=comparison)`
- "Download" → Placeholder (no handler)
- "Delete" → Deletes document

**Problem:** "View Analysis" and "Analyze" both go to DocumentDetail, but serve different purposes.

**DocumentDetail.tsx (lines 46, 50-55):**
- Has three tabs: "chunks", "document", "comparison"
- Reads `?tab` URL parameter and initializes activeTab correctly
- Displays appropriate content based on activeTab

**AnalysisResults.tsx:**
- Exists but is for Projects, not Documents
- Uses mock data
- Routes to `/projects/{projectId}`

---

## Solution: Three Distinct Actions

### 1. "Document Details" (NEW)
- **Route:** `/documents/{id}?tab=chunks`
- **Handler:** `navigate(/documents/${doc.id}?tab=chunks)`
- **Destination:** DocumentDetail.tsx with "chunks" tab active
- **Content:** Document content, extracted chunks, document metadata
- **Use case:** User wants to view/read the document

### 2. "View Analysis" (MODIFIED ROUTING)
- **Route:** `/documents/{id}/analysis`
- **Handler:** `navigate(/documents/${doc.id}/analysis)`
- **Destination:** NEW ComplianceAnalysisView.tsx page
- **Content:** Compliance report, score, findings, recommendations, clause-by-clause breakdown
- **Use case:** User wants to see analysis results of a completed/analyzed document
- **Data source:** Fetches from `GET /documents/{id}/latest-analysis` or `GET /comparisons/{comparison_id}/report`

### 3. "Analyze" (KEEP AS-IS)
- **Route:** POST `/documents/{id}/analyze`
- **Handler:** `handleStartAnalysis()` (unchanged)
- **Navigation:** `/documents/{id}?tab=comparison&comparison_id={comparison_id}`
- **Destination:** DocumentDetail.tsx with "comparison" tab active
- **Content:** Real-time comparison results as job progresses
- **Use case:** User wants to start a new compliance comparison job

---

## New Page: ComplianceAnalysisView.tsx

**File path:** `frontend/src/pages/ComplianceAnalysisView.tsx`

**Props via route:**
- `documentId` — from route param `/documents/:documentId/analysis`
- Optional `comparisonId` — could come from query param if multiple analyses exist

**Data fetching:**
```typescript
// Get document info
GET /documents/{documentId}

// Get latest comparison/analysis for this document
// Option A: GET /documents/{documentId}/latest-analysis
// Option B: Query comparisons where mizan_document_id = documentId
// Option C: Store comparison_id in document model

// Get report details
GET /comparisons/{comparisonId}/report
Response: {
  report: {
    id, compliance_score, total_findings,
    critical_count, medium_count, low_count,
    summary
  },
  findings: [
    { id, doc_a_section, doc_b_section, status, severity, issue, recommendation }
  ]
}
```

**UI Components:**
- Header: Document title, "Back to Documents" button
- Action buttons: "Download Report", "Ask AI Assistant"
- Overview section: Compliance score, findings count by severity
- Tabs: 
  - Findings tab — List of all findings with filters
  - Clause Analysis tab — Clause-by-clause breakdown
  - Recommendations tab — Action items
- AI Chat section: "Ask AI Compliance Assistant" panel

**Display logic:**
- If no analysis exists for document → Show "No analysis yet" with "Analyze Now" button
- If analysis exists → Show full report with all tabs
- If analysis still processing → Show loading state with progress

---

## Routing Updates

**Add to frontend router (App.tsx or router config):**
```typescript
{
  path: "/documents/:documentId/analysis",
  element: <ComplianceAnalysisView />
}
```

---

## Menu Handler Updates (Documents.tsx)

**Current (lines 432-438):**
```typescript
<DropdownMenuItem
  onClick={() => navigate(`/documents/${doc.id}`)}
  className="cursor-pointer"
>
  <Eye className="mr-2 h-4 w-4" />
  View Analysis
</DropdownMenuItem>
```

**Change to:**
```typescript
<DropdownMenuItem
  onClick={() => navigate(`/documents/${doc.id}/analysis`)}
  className="cursor-pointer"
>
  <Eye className="mr-2 h-4 w-4" />
  View Analysis
</DropdownMenuItem>
```

**Add new menu item (after Analyze):**
```typescript
<DropdownMenuItem
  onClick={() => navigate(`/documents/${doc.id}?tab=chunks`)}
  className="cursor-pointer"
>
  <FileText className="mr-2 h-4 w-4" />
  Document Details
</DropdownMenuItem>
```

---

## API Requirements

**Backend should provide (if not already implemented):**

1. **GET `/comparisons/{comparison_id}/report`** — Fetch comparison report with findings
   - Returns: `{ report: {...}, findings: [...] }`
   - Already implemented (from documents.py line 240-289)

2. **GET `/documents/{document_id}/latest-analysis`** (OPTIONAL if needed)
   - Returns latest comparison_id for a document
   - Alternative: Query `/comparisons` filtered by mizan_document_id

**If document doesn't have a comparison_id:**
- Check if one exists: `GET /documents/{id}` should include `comparison_id` field or link
- If none exists, show "No analysis" state with "Analyze Now" button

---

## Implementation Order

1. **Create ComplianceAnalysisView.tsx** — New page component
2. **Update Documents.tsx menu handlers** — Fix "View Analysis" route, add "Document Details" option
3. **Add route** — Register `/documents/:documentId/analysis` route
4. **Handle edge cases:**
   - Document with no analysis yet
   - Analysis still processing
   - Analysis failed

---

## Success Criteria

- ✅ Three distinct menu options in Documents list
- ✅ "Document Details" navigates to DocumentDetail with chunks tab
- ✅ "View Analysis" navigates to ComplianceAnalysisView
- ✅ "Analyze" triggers comparison and shows results in DocumentDetail
- ✅ ComplianceAnalysisView fetches and displays report data
- ✅ All routes work without errors
- ✅ No duplicate navigation or tab switches
