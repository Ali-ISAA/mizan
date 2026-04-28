# Quick Reference - Document Routing Flows

**Status:** ✅ All routing flows fully implemented and tested

---

## The 3 Flows

### Flow 1: Document Details
```
Menu: "Document Details" → URL: /documents/{id}?tab=chunks
Component: DocumentDetail
Tab: Chunks (shows extracted content from Noesia)
```

### Flow 2: View Analysis (No Results)
```
Menu: "View Analysis" → URL: /documents/{id}/analysis
Component: ComplianceAnalysisView
State: "No Analysis Yet" (no comparison_id in URL)
```

### Flow 3: Analyze (Start)
```
Menu: "Analyze" → POST /api/v1/documents/{id}/analyze
Returns: { comparison_id: "..." }
Navigate: /documents/{id}?comparison_id={id}&tab=comparison
Component: DocumentDetail + ComparisonResults
Polling: Watches /comparisons/{id}/status every 2s
```

### Flow 4: View Analysis (With Results)
```
Menu: "View Analysis" → URL: /documents/{id}/analysis?comparison_id={id}
Component: ComplianceAnalysisView
State: Shows full report + findings
Tabs: All, Critical, Medium, Low
```

---

## Implementation Files

### Frontend
- `frontend/src/pages/DocumentDetail.tsx` - Detail page with tabs
- `frontend/src/pages/ComplianceAnalysisView.tsx` - Analysis view
- `frontend/src/components/ComparisonResults.tsx` - Real-time results
- `frontend/src/hooks/useComparison.ts` - Polling logic
- `frontend/src/App.tsx` - Route configuration

### Backend
- `backend/app/api/v1/documents.py` - All 4 endpoints
  - `POST /{id}/analyze` (line 179)
  - `GET /{id}/chunks` (line 114)
  - `GET /comparisons/{id}/status` (line 218)
  - `GET /comparisons/{id}/report` (line 240)

---

## Testing Files

| File | Purpose | Lines |
|------|---------|-------|
| `TESTING_REPORT.md` | Technical analysis of all flows | 400+ |
| `MANUAL_TEST_GUIDE.md` | Step-by-step browser testing | 350+ |
| `TEST_RESULTS_SUMMARY.md` | Comprehensive verification results | 550+ |
| `INTEGRATION_TEST_COMPLETE.md` | Task completion summary | 400+ |
| `QUICK_REFERENCE.md` | This file - quick lookup | 100+ |

---

## URL Patterns

```
/documents
  ↓
/documents/{id}?tab=chunks
/documents/{id}?tab=document
/documents/{id}?tab=comparison&comparison_id={id}
/documents/{id}/analysis
/documents/{id}/analysis?comparison_id={id}
```

---

## API Endpoints

```
POST   /api/v1/documents/{id}/analyze
GET    /api/v1/documents/{id}/chunks
GET    /api/v1/comparisons/{id}/status
GET    /api/v1/comparisons/{id}/report
```

---

## Menu Items (5 total)

1. View Analysis → `/documents/{id}/analysis`
2. Analyze → POST `/documents/{id}/analyze`
3. Document Details → `/documents/{id}?tab=chunks`
4. Download (handler present)
5. Delete (confirmation dialog)

---

## Response Types

### POST /documents/{id}/analyze
```json
{
  "comparison_id": "uuid",
  "status": "pending",
  "created_at": "2026-04-27T..."
}
```

### GET /comparisons/{id}/report
```json
{
  "report": {
    "id": "uuid",
    "compliance_score": 85,
    "total_findings": 10,
    "critical_count": 2,
    "medium_count": 5,
    "low_count": 3,
    "summary": "string"
  },
  "findings": [
    {
      "id": "uuid",
      "doc_a_section": "...",
      "doc_b_section": "...",
      "status": "gap|compliant|conflict|missing",
      "severity": "critical|medium|low",
      "issue": "...",
      "recommendation": "..."
    }
  ]
}
```

---

## Verification Checklist

- ✅ All routes implemented
- ✅ All components created
- ✅ All endpoints working
- ✅ All hooks functional
- ✅ All types defined
- ✅ Error handling present
- ✅ Loading states shown
- ✅ Polling configured
- ✅ Authentication required
- ✅ Database connected
- ✅ Worker running
- ✅ No console errors

---

## Docker Status

```bash
docker-compose ps
# Expected: 7/7 UP

docker-compose logs backend
# Check for errors

docker-compose logs worker
# Check Celery processing
```

---

## Manual Testing

```bash
# 1. Open browser to http://localhost:8002
# 2. Open DevTools (F12)
# 3. Go to Documents page
# 4. Test each flow (see MANUAL_TEST_GUIDE.md)
# 5. Check Console for errors
# 6. Check Network for 2xx responses
```

---

## Common Troubleshooting

| Issue | Fix |
|-------|-----|
| URL doesn't change | Check browser console for errors |
| Blank page loads | Verify document status is "completed" |
| Chunks don't appear | Ensure noesia_chunk_count > 0 |
| Results don't appear | Check Celery worker logs |
| 404 errors | Verify document/comparison IDs exist |
| Auth errors | Re-login and check JWT token |

---

## Key Hooks/Functions

- `useNavigate()` - React Router navigation
- `useParams()` - Extract URL params
- `useSearchParams()` - Extract query params
- `useQuery()` - React Query data fetching
- `useComparison()` - Custom hook for polling

---

## Score Color Thresholds

- 🟢 Green: >= 80%
- 🟡 Yellow: 60-79%
- 🔴 Red: < 60%

---

## Polling Configuration

- Interval: 2 seconds
- Stops when: status = "completed" or "failed"
- Then fetches: `/comparisons/{id}/report`

---

## Component Hierarchy

```
Documents (list)
├── DropdownMenu (5 items)
│   ├── View Analysis → ComplianceAnalysisView (no results)
│   ├── Analyze → DocumentDetail + ComparisonResults
│   ├── Document Details → DocumentDetail
│   ├── Download
│   └── Delete

DocumentDetail
├── Chunks tab → ChunksList
├── Document tab → ExtractedContentView
└── Comparison tab → ComparisonResults

ComplianceAnalysisView
├── No Analysis state
└── Analysis state (with tabs)
    ├── All findings tab
    ├── Critical tab
    ├── Medium tab
    └── Low tab
```

---

**For detailed information, see:**
- `TESTING_REPORT.md` - Complete technical analysis
- `MANUAL_TEST_GUIDE.md` - Step-by-step testing instructions
- `TEST_RESULTS_SUMMARY.md` - Full verification results
