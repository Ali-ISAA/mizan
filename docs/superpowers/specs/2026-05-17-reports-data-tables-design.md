# Reports Data Tables Design

## Overview

Add a new "Data Tables" top-level tab to the Reports & Analytics page. The tab contains three tabular views of compliance data already returned by the `/analytics` API — Documents, Issues, and Regulations. No backend changes required.

## Goal

Give users a dense, scannable, tabular view of all compliance data alongside the existing chart-based views. The tables enable quick comparison, sorting, and reading of raw numbers that charts don't convey well.

## Scope

- One new top-level tab: **Data Tables**
- Three nested sub-tabs inside it: **Documents**, **Issues**, **Regulations**
- Client-side sorting for the Documents table only
- No new API endpoints — all data comes from existing `/analytics` response

---

## Data Source

All data comes from the existing `AnalyticsData` interface returned by `GET /analytics`:

```ts
documents: { name, score, issues, critical, medium, regulation, completed_at }[]
top_issues: { issue, severity, count }[]
regulation_breakdown: { regulation, avg_score, doc_count, total_issues, critical_total }[]
```

---

## Sub-tab 1: Documents Table

**Columns:**

| Column | Source field | Notes |
|---|---|---|
| Document Name | `doc.name` | Left-aligned, truncated |
| Regulation | `doc.regulation` | Filename of base doc |
| Score | `doc.score` | Color-coded: ≥80 green, ≥60 amber, <60 red |
| Issues | `doc.issues` | Total findings |
| Critical | `doc.critical` | Red text if > 0, otherwise normal |
| Medium | `doc.medium` | Amber text if > 0, otherwise normal |
| Last Analyzed | `doc.completed_at` | Formatted as "May 12, 2026"; render "—" if null |

**Sorting:** Click any column header to sort ascending; click again to sort descending. An arrow indicator shows the active sort column and direction using `ArrowUp`, `ArrowDown`, or `ArrowUpDown` icons from lucide-react. Sort state managed with `useState`.

**Default sort:** Score ascending (lowest score first — surfaces worst-performing documents immediately). Note: ascending = worst first is intentional; do not change to descending.

**Sort state type:**
```ts
type DocSortCol = keyof AnalyticsData["documents"][number];
const [docSort, setDocSort] = useState<{ col: DocSortCol; dir: "asc" | "desc" }>({ col: "score", dir: "asc" });
```

**Sort logic:** `useMemo` deriving `sortedDocuments` from `documents` + `docSort`:
```ts
const sortedDocuments = useMemo(() => {
  return [...documents].sort((a, b) => {
    const av = a[docSort.col], bv = b[docSort.col];
    if (av == null) return 1;
    if (bv == null) return -1;
    return docSort.dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });
}, [documents, docSort]);
```

---

## Sub-tab 2: Issues Table

**Columns:**

| Column | Source field | Notes |
|---|---|---|
| # | index + 1 | Row rank, muted text |
| Issue Description | `issue.issue` | Full text, wraps |
| Severity | `issue.severity` | Colored badge using existing `severityBadge()` helper |
| Occurrences | `issue.count` | Bold number |

**Sorting:** Render `top_issues` as received from the API (already sorted by count descending). No client-side sort.

**Empty state:** "No issues recorded yet." centered text.

---

## Sub-tab 3: Regulations Table

**Columns:**

| Column | Source field | Notes |
|---|---|---|
| Regulation | `reg.regulation` | Filename |
| Avg Score | `reg.avg_score` | Color-coded using existing `scoreColor()` helper |
| Documents | `reg.doc_count` | Count |
| Total Issues | `reg.total_issues` | Count |
| Critical Issues | `reg.critical_total` | Red text if > 0, otherwise normal |
| Issue Rate | derived | See formula below |

**Issue Rate formula:**
```ts
reg.total_issues === 0 ? "—" : `${Math.round(reg.critical_total / reg.total_issues * 100)}%`
```
Render "—" when `total_issues === 0` to avoid NaN. This column shows what percentage of a regulation's issues are critical — a metric not shown anywhere else in the UI.

**Sorting:** Render `regulation_breakdown` as received from the API (already sorted by avg_score ascending — worst regulation first). No client-side sort needed.

**Empty state:** "No regulation data yet." centered text.

---

## UI Structure

### Step 1 — Add outer trigger
Insert into the existing outer `TabsList` in `Reports.tsx` (after the existing `value="regulations"` trigger):
```tsx
<TabsTrigger value="tables">Data Tables</TabsTrigger>
```

### Step 2 — Add outer TabsContent with nested Tabs
```tsx
<TabsContent value="tables" className="space-y-4">
  <Tabs defaultValue="doc-table">
    <TabsList>
      <TabsTrigger value="doc-table">Documents ({documents.length})</TabsTrigger>
      <TabsTrigger value="issues-table">Issues ({top_issues.length})</TabsTrigger>
      <TabsTrigger value="reg-table">Regulations ({regulation_breakdown.length})</TabsTrigger>
    </TabsList>
    <TabsContent value="doc-table"> ... </TabsContent>
    <TabsContent value="issues-table"> ... </TabsContent>
    <TabsContent value="reg-table"> ... </TabsContent>
  </Tabs>
</TabsContent>
```

Note: inner sub-tab values use distinct names (`doc-table`, `issues-table`, `reg-table`) to avoid any potential confusion with the outer tab values (`documents`, `regulations`).

Each sub-tab content is wrapped in a `Card` with `CardHeader` (title + description) and `CardContent` containing the shadcn `Table`.

---

## Component Details

**File modified:** `frontend/src/pages/Reports.tsx` only.

**New React import** (add at top of file):
```ts
import { useState, useMemo } from "react";
```

**New component imports:**
```ts
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
```

**Reuse existing helpers** (no changes needed):
- `scoreColor(score)` — already defined in Reports.tsx
- `severityBadge(severity)` — already defined in Reports.tsx

---

## Empty States

Each table shows a centered message if its data array is empty:
- Documents: "No documents analyzed yet."
- Issues: "No issues recorded yet."
- Regulations: "No regulation data yet."

---

## Out of Scope

- Pagination (datasets are small — max ~50 rows expected)
- Search/filter within tables
- CSV export per table (the existing Export button covers this at page level)
- Interactive sorting on Issues and Regulations tables
