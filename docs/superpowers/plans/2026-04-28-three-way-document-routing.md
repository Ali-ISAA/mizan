# Three-Way Document Routing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create three distinct document workflows: view document details, view compliance analysis results, and start new analysis comparison.

**Architecture:** Add ComplianceAnalysisView.tsx page to display compliance reports fetched from backend. Update Documents.tsx dropdown menu to route "View Analysis" to new page and add missing "Document Details" option. Register new route in frontend router.

**Tech Stack:** React 19 + TypeScript, React Router, React Query, Tailwind CSS, shadcn/ui components

---

## File Structure

| File | Action | Responsibility |
|------|--------|-----------------|
| `frontend/src/pages/ComplianceAnalysisView.tsx` | Create | Display compliance report for a document |
| `frontend/src/pages/Documents.tsx` | Modify | Update menu handlers for three distinct actions |
| `frontend/src/App.tsx` | Modify | Add route for `/documents/:documentId/analysis` |
| `frontend/src/pages/__tests__/ComplianceAnalysisView.test.tsx` | Create | Unit tests for compliance analysis page |

---

## Chunk 1: Router Configuration & ComplianceAnalysisView Page

### Task 1: Check Current Router Configuration

**Files:**
- Read: `frontend/src/App.tsx`
- Read: `frontend/src/main.tsx` (if separate router config)

- [ ] **Step 1: Locate router configuration**

Run: `grep -n "documents/:documentId" frontend/src/App.tsx`

Expected: Find existing route pattern to follow (e.g., `<Route path="/documents/:documentId" element={<DocumentDetail />} />`)

- [ ] **Step 2: Note the route pattern**

Document the exact syntax used (React Router v6 pattern with `<Route>` or similar) for consistency.

---

### Task 2: Create ComplianceAnalysisView.tsx Page

**Files:**
- Create: `frontend/src/pages/ComplianceAnalysisView.tsx`

- [ ] **Step 1: Write the component stub with imports and basic structure**

```typescript
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, MessageCircle, Loader, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DocumentData {
  id: string;
  name: string;
  file_type?: string;
  file_size?: number;
  processing_status: string;
  base_document_id?: string;
}

interface ComplianceReport {
  id: string;
  compliance_score: number;
  total_findings: number;
  critical_count: number;
  medium_count: number;
  low_count: number;
  summary: string;
}

interface Finding {
  id: string;
  doc_a_section: string;
  doc_b_section: string;
  status: string;
  severity: string;
  issue: string;
  recommendation: string;
}

export default function ComplianceAnalysisView() {
  const navigate = useNavigate();
  const { documentId } = useParams<{ documentId: string }>();

  if (!documentId) {
    return <div className="flex-1 p-8">Invalid document ID</div>;
  }

  return (
    <div className="space-y-6">
      <div>Loading...</div>
    </div>
  );
}
```

- [ ] **Step 2: Add document data fetching**

Add after `const { documentId } = useParams()`:

```typescript
const { data: documentData, isLoading: docLoading } = useQuery({
  queryKey: ["document", documentId],
  queryFn: () => 
    api.get(`/documents`)
      .then(r => {
        const docs = r.data as DocumentData[];
        return docs.find(d => d.id === documentId);
      })
      .catch(() => null),
});
```

- [ ] **Step 3: Add comparison report fetching**

Add after document query:

```typescript
// Fetch latest comparison for this document
const { data: comparisonData, isLoading: comparisonLoading } = useQuery({
  queryKey: ["comparison", documentId],
  queryFn: async () => {
    // Query all comparisons and find the latest one for this document
    const response = await api.get(`/documents/${documentId}`);
    const doc = response.data as DocumentData;
    
    if (!doc || !doc.base_document_id) return null;
    
    // This is a workaround - ideally backend would have /documents/{id}/latest-comparison
    // For now, we'll fetch the document and assume comparison_id might be in response
    // OR we query the comparison endpoint with filtering
    // FALLBACK: Return null if no comparison found, show "No analysis" state
    return null;
  },
  enabled: !!documentData,
});

// Fetch report if we have a comparison_id (from URL param or document data)
const comparisonId = new URLSearchParams(window.location.search).get("comparison_id");
const { data: reportData, isLoading: reportLoading } = useQuery({
  queryKey: ["comparison-report", comparisonId],
  queryFn: () =>
    api.get(`/documents/${documentId}/comparisons/${comparisonId}/report`)
      .then(r => r.data)
      .catch(() => null),
  enabled: !!comparisonId,
});
```

- [ ] **Step 4: Add UI rendering with header and loading states**

Replace the `<div>Loading...</div>` with:

```typescript
  // Loading state
  if (docLoading) {
    return <div className="flex-1 p-8">Loading document...</div>;
  }

  if (!documentData) {
    return (
      <div className="flex-1 p-8">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Document not found</h2>
          <Button onClick={() => navigate("/documents")} variant="outline">
            Back to Documents
          </Button>
        </div>
      </div>
    );
  }

  // No analysis state
  if (!comparisonId || reportLoading === false && !reportData) {
    return (
      <div className="flex-1 p-8 space-y-4">
        <Button onClick={() => navigate("/documents")} variant="ghost" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Documents
        </Button>
        <Card>
          <CardHeader className="text-center">
            <CardTitle>No Analysis Yet</CardTitle>
            <CardDescription>This document hasn't been analyzed for compliance yet</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate(`/documents/${documentId}?tab=comparison`)}>
              Start Analysis
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (reportLoading) {
    return (
      <div className="flex-1 p-8">
        <div className="flex items-center justify-center gap-2">
          <Loader className="h-5 w-5 animate-spin" />
          Loading analysis results...
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="flex-1 p-8">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-critical mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Failed to load analysis</h2>
          <Button onClick={() => navigate("/documents")} variant="outline">
            Back to Documents
          </Button>
        </div>
      </div>
    );
  }

  const report = reportData.report as ComplianceReport;
  const findings = reportData.findings as Finding[];
```

- [ ] **Step 5: Add header section with document title and action buttons**

Add before the loading state check:

```typescript
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/documents")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Documents
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{documentData?.name}</h1>
            <p className="text-text-secondary">Compliance Analysis Report</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Download Report
          </Button>
          <Button className="gap-2">
            <MessageCircle className="h-4 w-4" />
            Ask AI Assistant
          </Button>
        </div>
      </div>

      {/* Loading/Error states go here - insert from Step 4 */}
      
      {/* Content goes here - to be added in next steps */}
    </div>
  );
```

- [ ] **Step 6: Add compliance overview card**

Add after header, before the return statement's closing `</div>`:

```typescript
      {/* Overview Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{report.compliance_score}%</CardTitle>
              <CardDescription>Overall Compliance Score</CardDescription>
            </div>
            <Badge className={
              report.compliance_score >= 80 ? "bg-success/10 text-success" :
              report.compliance_score >= 60 ? "bg-warning/10 text-warning" :
              "bg-critical/10 text-critical"
            }>
              {report.compliance_score >= 80 ? "Compliant" :
               report.compliance_score >= 60 ? "Needs Review" :
               "Critical Issues"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded border border-border">
            <div className="text-2xl font-bold">{report.total_findings}</div>
            <div className="text-sm text-text-secondary">Total Findings</div>
          </div>
          <div className="p-4 rounded border border-border">
            <div className="text-2xl font-bold text-critical">{report.critical_count}</div>
            <div className="text-sm text-text-secondary">Critical Issues</div>
          </div>
          <div className="p-4 rounded border border-border">
            <div className="text-2xl font-bold text-warning">{report.medium_count}</div>
            <div className="text-sm text-text-secondary">Medium Priority</div>
          </div>
        </CardContent>
      </Card>

      {/* Findings Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary whitespace-pre-line">{report.summary}</p>
        </CardContent>
      </Card>

      {/* Findings Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Findings</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">All ({findings.length})</TabsTrigger>
              <TabsTrigger value="critical">Critical ({report.critical_count})</TabsTrigger>
              <TabsTrigger value="medium">Medium ({report.medium_count})</TabsTrigger>
              <TabsTrigger value="low">Low ({report.low_count})</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="space-y-3">
              {findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </TabsContent>
            
            <TabsContent value="critical" className="space-y-3">
              {findings.filter(f => f.severity === "critical").map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </TabsContent>
            
            <TabsContent value="medium" className="space-y-3">
              {findings.filter(f => f.severity === "medium").map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </TabsContent>
            
            <TabsContent value="low" className="space-y-3">
              {findings.filter(f => f.severity === "low").map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper component for individual findings
function FindingCard({ finding }: { finding: Finding }) {
  const severityColor = {
    critical: "bg-critical/10 text-critical",
    medium: "bg-warning/10 text-warning",
    low: "bg-info/10 text-info",
  };

  return (
    <div className="p-4 border border-border rounded space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold">{finding.issue}</h4>
          <p className="text-sm text-text-secondary mt-1">{finding.doc_a_section}</p>
        </div>
        <Badge className={severityColor[finding.severity as keyof typeof severityColor]}>
          {finding.severity}
        </Badge>
      </div>
      <p className="text-sm text-text-secondary"><strong>Recommendation:</strong> {finding.recommendation}</p>
    </div>
  );
}
```

- [ ] **Step 7: Run TypeScript compiler to check for errors**

Run: `cd frontend && npx tsc --noEmit`

Expected: No TypeScript errors in ComplianceAnalysisView.tsx

- [ ] **Step 8: Commit ComplianceAnalysisView**

```bash
git add frontend/src/pages/ComplianceAnalysisView.tsx
git commit -m "feat(pages): create ComplianceAnalysisView for document analysis results"
```

---

## Chunk 2: Update Documents.tsx & Add Router Entry

### Task 3: Update Documents.tsx Menu Handlers

**Files:**
- Modify: `frontend/src/pages/Documents.tsx` (lines 432-445)

- [ ] **Step 1: Update "View Analysis" menu item handler**

Find line ~433 in Documents.tsx:
```typescript
<DropdownMenuItem
  onClick={() => navigate(`/documents/${doc.id}`)}
```

Change to:
```typescript
<DropdownMenuItem
  onClick={() => navigate(`/documents/${doc.id}/analysis`)}
```

- [ ] **Step 2: Add "Document Details" menu item**

After the "Analyze" menu item (after line 445), add:

```typescript
<DropdownMenuItem
  onClick={() => navigate(`/documents/${doc.id}?tab=chunks`)}
  className="cursor-pointer"
>
  <FileText className="mr-2 h-4 w-4" />
  Document Details
</DropdownMenuItem>
```

Note: `FileText` icon should already be imported at the top. If not, add to imports on line 4.

- [ ] **Step 3: Verify menu item order**

Expected menu order after change:
1. View Analysis (→ analysis page)
2. Analyze (→ start comparison)
3. Document Details (→ document view)
4. Download
5. Delete

- [ ] **Step 4: Run frontend dev server and check menu renders**

Run: `cd frontend && npm run dev`

Navigate to `http://localhost:8002/documents` and verify dropdown menu shows 5 items with correct labels.

- [ ] **Step 5: Commit Documents.tsx changes**

```bash
git add frontend/src/pages/Documents.tsx
git commit -m "feat(pages): update Documents menu - add Document Details, fix View Analysis route"
```

---

### Task 4: Add Router Entry for Analysis Page

**Files:**
- Modify: `frontend/src/App.tsx` (or router config file)

- [ ] **Step 1: Find existing documents route**

Run: `grep -A2 "documents/:documentId" frontend/src/App.tsx`

Expected: Find pattern like `<Route path="/documents/:documentId" element={<DocumentDetail />} />`

- [ ] **Step 2: Add new analysis route**

After the existing `/documents/:documentId` route, add:

```typescript
<Route path="/documents/:documentId/analysis" element={<ComplianceAnalysisView />} />
```

- [ ] **Step 3: Import ComplianceAnalysisView**

Add to imports at top of App.tsx (with other page imports):

```typescript
import ComplianceAnalysisView from "@/pages/ComplianceAnalysisView";
```

- [ ] **Step 4: Run frontend dev server and test routing**

Run: `cd frontend && npm run dev`

Navigate to `http://localhost:8002/documents` → Click a document's "View Analysis" menu item → Verify it routes to `/documents/{id}/analysis`

Expected: Page shows "No Analysis Yet" message or analysis results if comparison exists.

- [ ] **Step 5: Commit router changes**

```bash
git add frontend/src/App.tsx
git commit -m "feat(router): add /documents/:documentId/analysis route"
```

---

## Chunk 3: Test Integration

### Task 5: Test All Three Flows End-to-End

**Files:**
- Test: Browser/manual testing (Docker containers must be running)

- [ ] **Step 1: Verify Docker containers running**

Run: `docker-compose ps`

Expected: All containers UP (db, redis, qdrant, backend, worker, frontend)

- [ ] **Step 2: Test Flow 1 - Document Details**

1. Navigate to `http://localhost:8002/documents`
2. Click the "..." menu on a document
3. Click "Document Details"
4. Verify: Page shows document with "chunks" tab active
5. Verify: Document content/chunks are displayed

- [ ] **Step 3: Test Flow 2 - View Analysis (No Analysis Yet)**

1. Navigate to `http://localhost:8002/documents`
2. Click "..." menu on a document that hasn't been analyzed
3. Click "View Analysis"
4. Verify: Routes to `/documents/{id}/analysis`
5. Verify: Shows "No Analysis Yet" message
6. Click "Start Analysis" button
7. Verify: Routes to document detail with comparison tab

- [ ] **Step 4: Test Flow 3 - Analyze**

1. Navigate to `http://localhost:8002/documents`
2. Click "..." menu on a document
3. Click "Analyze"
4. Verify: POST `/documents/{id}/analyze` is called
5. Verify: Page navigates to `/documents/{id}?tab=comparison&comparison_id={id}`
6. Verify: "Compliance Analysis" tab is active
7. Wait for backend to process comparison
8. Verify: Findings appear as comparison completes

- [ ] **Step 5: Test Flow 2 Again - View Analysis (With Results)**

After analysis completes from Step 4:

1. Navigate back to documents list
2. Click "..." menu on the analyzed document
3. Click "View Analysis"
4. Verify: Routes to `/documents/{id}/analysis`
5. Verify: Shows compliance report with score, findings, recommendations
6. Verify: Tabs for All, Critical, Medium, Low work correctly
7. Verify: "Download Report" and "Ask AI Assistant" buttons are visible

- [ ] **Step 6: Test API Error Handling**

1. Manually navigate to `/documents/invalid-id/analysis`
2. Verify: Shows appropriate error message
3. Verify: "Back to Documents" button works

- [ ] **Step 7: Document test results**

Create a `TEST_RESULTS.md` file with:
- All three flows tested ✓/✗
- No errors in browser console
- All API calls completed successfully
- Menu items display correctly

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "test: verify three-way document routing flows end-to-end"
```

---

## Success Criteria Checklist

- [ ] ComplianceAnalysisView.tsx created with report display
- [ ] Documents.tsx menu updated: "View Analysis" → `/documents/{id}/analysis`, "Document Details" added
- [ ] Router entry added for `/documents/:documentId/analysis`
- [ ] All three flows work without errors:
  - Document Details → DocumentDetail with chunks tab
  - View Analysis → ComplianceAnalysisView with report
  - Analyze → Start comparison, show results in DocumentDetail
- [ ] No errors in browser console or network tab
- [ ] All API calls complete successfully
- [ ] Menu displays all 5 options in correct order
