# Manual End-to-End Testing Guide

## Pre-Test Checklist

```bash
# 1. Verify all containers are running
docker-compose ps

# Expected output: All 7 services showing "Up"
# - mizan-backend-1 (port 8001)
# - mizan-frontend-1 (port 8002)
# - mizan-db-1 (port 5435)
# - mizan-redis-1 (port 6382)
# - mizan-qdrant-1 (port 7014)
# - mizan-worker-1 (Celery)
# - mizan-superadmin-1 (port 8003)

# 2. Check backend logs for errors
docker-compose logs backend | tail -20

# 3. Check worker logs for errors
docker-compose logs worker | tail -20

# 4. Open browser to frontend
# Navigate to: http://localhost:8002
```

---

## Manual Test Flow 1: Document Details Button

### Prerequisites
- Browser open to http://localhost:8002
- Logged in to application
- At least one document exists in the system

### Step-by-Step

**Step 1:** Navigate to Documents page
```
Click: "Documents" in main navigation
Expected URL: http://localhost:8002/documents
```

**Step 2:** Open browser Developer Tools
```
Press: F12 (or Right-click → Inspect)
Go to: Console tab (to watch for errors)
Go to: Network tab (to watch API calls)
```

**Step 3:** Find a document in the list
```
Look for: Documents table with columns:
  - Document Name
  - Type
  - Upload Date
  - Status
  - Compliance Score
  - Issues
  - Size
  - Actions (... menu)

Click on: Any document row's "..." (three dots) menu button on the right
```

**Step 4:** Click "Document Details"
```
In dropdown menu, click: "Document Details" (with FileText icon)
Watch Network tab: Should see GET /documents request
Expected URL after click: http://localhost:8002/documents/{id}?tab=chunks
```

**Step 5:** Verify page loaded correctly
```
Expected state:
✅ URL shows: /documents/{id}?tab=chunks
✅ "Back to Documents" link visible at top
✅ Document name displayed in header
✅ File type badge shown
✅ Document status badge shown (e.g., "Completed")
✅ Metadata grid visible:
   - Chunks count
   - File Size
   - Status
   - Uploaded date
✅ Tabs visible at bottom:
   - "Chunks" tab (should be active/highlighted)
   - "Document" tab
   - "Compliance Analysis" tab
✅ Chunks list displayed below tabs with:
   - Chunk text
   - Metadata (section header, chunk index, etc.)
```

**Step 6:** Check Console
```
Expected: NO console errors (red X marks)
Expected: All API responses are green (200 status)
```

**Step 7:** Click other tabs to verify
```
Click: "Document" tab
Expected: Full extracted document content displayed

Click: "Compliance Analysis" tab
Expected: Either:
  - "No Analysis Yet" message (if no comparison_id)
  - OR Compliance results (if analysis was run)
```

### Troubleshooting

| Issue | Check |
|-------|-------|
| URL doesn't change | Browser console for errors; check network tab for failed requests |
| Page shows blank | Check if document processing_status is "completed" |
| Chunks don't load | Verify noesia_chunk_count > 0; check network tab for GET /chunks request |
| Tabs don't appear | Document must be in "completed" status; check backend logs |

**PASS:** ✅ All checks above pass with no console errors
**FAIL:** ❌ If any of the above checks fail

---

## Manual Test Flow 2: View Analysis (No Analysis Yet)

### Prerequisites
- Browser open to http://localhost:8002/documents
- Have a document that hasn't been analyzed yet (no comparison_id)

### Step-by-Step

**Step 1:** Find a document without analysis
```
Look for: A document in the table that:
  - Has been uploaded
  - Processing status is "Completed"
  - But hasn't been analyzed yet

Click: "..." menu on that document
```

**Step 2:** Click "View Analysis"
```
In dropdown menu, click: "View Analysis" (with Eye icon)
Watch Network tab: May see GET /documents request
Expected URL after click: http://localhost:8002/documents/{id}/analysis
```

**Step 3:** Verify "No Analysis Yet" state
```
Expected state:
✅ URL shows: /documents/{id}/analysis
✅ NO ?comparison_id parameter in URL
✅ Page displays:
   - "Back to Documents" link at top
   - Centered AlertCircle icon (gray, about 64px)
   - Heading: "No Analysis Yet"
   - Text: "Start a compliance analysis by uploading a document..."
✅ Background should be clean, minimal
```

**Step 4:** Check Console
```
Expected: NO console errors
Expected: All API responses are 200
```

**Step 5:** Click back button
```
Click: "Back to Documents"
Expected URL: http://localhost:8002/documents
Expected: Documents list displays correctly
```

### Troubleshooting

| Issue | Check |
|-------|-------|
| Shows analysis results instead of "No Analysis Yet" | Document might already have comparison_id; check URL has NO comparison_id param |
| Page shows error | Check browser console; verify documentId is in URL params |
| Back button doesn't work | Check console for routing errors; may need to restart frontend dev server |

**PASS:** ✅ Shows "No Analysis Yet" without errors
**FAIL:** ❌ If page shows analysis or errors

---

## Manual Test Flow 3: Analyze (Start Comparison)

### Prerequisites
- Browser open to http://localhost:8002/documents
- Have a document ready to analyze
- Backend must be responsive
- Celery worker must be running

### Step-by-Step

**Step 1:** Open Developer Tools
```
Press: F12
Go to: Network tab
Go to: Console tab
Filter Network tab: To see XHR/Fetch requests only
```

**Step 2:** Find document and click Analyze
```
Click: "..." menu on any document
Click: "Analyze" (with Zap icon)
```

**Step 3:** Watch Network tab
```
Expected request: POST /api/v1/documents/{id}/analyze
Expected response:
{
  "comparison_id": "uuid-string-here"
}
Status: 201 Created (or 200 OK)
```

**Step 4:** Verify page navigation
```
Expected URL after success: http://localhost:8002/documents/{id}?comparison_id={uuid}&tab=comparison
Expected page: DocumentDetail component loads
Expected tab: "Compliance Analysis" tab is active (highlighted)
```

**Step 5:** Check initial state
```
Expected:
✅ Document header visible with name
✅ Three tabs visible:
   - Chunks
   - Document
   - Compliance Analysis (ACTIVE)
✅ Comparison tab shows either:
   - Loading spinner + "Loading analysis..."
   - OR initial results starting to appear
✅ NO "No Analysis Yet" message (because comparison_id is present)
```

**Step 6:** Wait for Celery processing
```
After 5-10 seconds, expected updates:
✅ Compliance score appears (e.g., 85%)
✅ Finding counts appear:
   - Critical: X
   - Medium: Y
   - Low: Z
✅ Findings start appearing in list below
```

**Step 7:** Verify Celery worker activity
```
In another terminal:
docker-compose logs worker | tail -30

Expected: Logs showing:
[celery] Task processing started
[celery] Task completed successfully
```

**Step 8:** Check Console
```
Expected: NO console errors
Expected: Network requests all 2xx status
```

### Troubleshooting

| Issue | Check |
|-------|-------|
| POST request returns 400/500 | Check backend logs: docker-compose logs backend |
| Page doesn't navigate | Check console for routing errors |
| Results don't appear after 10s | Check Celery worker: docker-compose logs worker |
| Results show "No Analysis Yet" | Browser cached old URL; hard refresh (Ctrl+Shift+R) |

**PASS:** ✅ Navigation works, results appear, no errors
**FAIL:** ❌ If POST fails or results never appear

---

## Manual Test Flow 4: View Analysis (With Results)

### Prerequisites
- Flow 3 must have completed successfully
- Analysis results are available in the database
- comparison_id exists for a document

### Step-by-Step

**Step 1:** Navigate back to documents list
```
Click: "Back to Documents" button
OR: Type in URL: http://localhost:8002/documents
```

**Step 2:** Open Developer Tools
```
Press: F12
Go to: Network tab
Go to: Console tab
```

**Step 3:** Find the document that was just analyzed
```
Look for: Document with status showing compliance badge (green/yellow/red)
Look for: Compliance score in the "Compliance Score" column
Look for: Issues count in the "Issues" column

Click: "..." menu on that document
Click: "View Analysis" (Eye icon)
```

**Step 4:** Verify page loads with results
```
Expected URL: http://localhost:8002/documents/{id}/analysis?comparison_id={uuid}
Expected page: ComplianceAnalysisView component
Expected state:
✅ Document title visible at top
✅ "Compliance Analysis Results" subtitle
✅ Two action buttons:
   - "Download Report" (Download icon)
   - "Ask AI Assistant" (MessageSquare icon)
```

**Step 5:** Verify compliance score display
```
Expected:
✅ Large compliance score visible (e.g., "🟢 85%")
✅ Emoji indicator:
   - 🟢 if >= 80%
   - 🟡 if 60-79%
   - 🔴 if < 60%
✅ Score color matches emoji:
   - Green text if 🟢
   - Yellow text if 🟡
   - Red text if 🔴
✅ Summary text below score
```

**Step 6:** Verify findings counts
```
Expected in "Compliance Assessment" card:
✅ "Critical" count (red number)
✅ "Medium" count (yellow number)
✅ "Low" count (green number)
✅ All counts > 0 (or 0 if no findings)
```

**Step 7:** Test tab filtering
```
Click: "All" tab (shows all findings)
Expected: List shows findings with count badge

Click: "Critical" tab
Expected: Shows only critical severity findings
Expected: Count matches "Critical" number from step 6

Click: "Medium" tab
Expected: Shows only medium severity findings

Click: "Low" tab
Expected: Shows only low severity findings

Click: "All" tab again
Expected: All findings shown again
```

**Step 8:** Verify finding details
```
For each finding shown:
✅ Heading (issue title)
✅ Recommendation text below
✅ Severity badge (Critical/Medium/Low) on right
✅ Document A Section referenced at bottom
✅ Document B Section referenced at bottom
✅ Border separating each finding
```

**Step 9:** Test action buttons
```
Click: "Download Report" button
Expected: Browser downloads a file (PDF or document format)

Click: "Ask AI Assistant" button
Expected: Chat interface appears OR modal opens
```

**Step 10:** Check Console
```
Expected: NO console errors
Expected: Network requests show:
   - GET /documents (fetch doc metadata)
   - GET /comparisons/{id}/report (fetch report data)
Both should be 200 OK
```

### Troubleshooting

| Issue | Check |
|-------|-------|
| "No Analysis Yet" shows instead of results | URL might not include comparison_id; check URL bar |
| Results don't load | Check Network tab for GET /comparisons/{id}/report; verify status 200 |
| Tabs don't filter correctly | Browser console for errors; try hard refresh (Ctrl+Shift+R) |
| Action buttons don't work | Handlers may not be implemented; check console |
| Findings don't display | Check Network response includes findings array; verify backend returned data |

**PASS:** ✅ All results display, tabs filter, no errors
**FAIL:** ❌ If results missing or filtering broken

---

## Summary Checklist

After completing all 4 flows, verify:

### Menu Structure
```
□ View Analysis        - Routes to /documents/{id}/analysis
□ Analyze              - Triggers POST, routes to comparison tab
□ Document Details     - Routes to /documents/{id}?tab=chunks
□ Download             - Button visible (may not be functional yet)
□ Delete               - Button visible with confirmation dialog
```

### Navigation
```
□ Flow 1: /documents/{id}?tab=chunks            ✅ Works
□ Flow 2: /documents/{id}/analysis              ✅ Works
□ Flow 3: /documents/{id}?comparison_id=...    ✅ Works
□ Flow 4: /documents/{id}/analysis?comparison_id=... ✅ Works
```

### Error Checking
```
□ Browser Console (F12 → Console):      No red errors
□ Network Tab (F12 → Network):          No 4xx or 5xx responses
□ Backend Logs:                         No ERROR logs
□ Worker Logs:                          No ERROR logs
```

### Final Status
```
ALL 4 FLOWS: ✅ PASS
NO CONSOLE ERRORS: ✅ PASS
NO NETWORK ERRORS: ✅ PASS
READY FOR DEPLOYMENT: ✅ YES
```

---

## Notes

- Each flow should complete without errors
- Total testing time: ~15-20 minutes
- Results files can be saved for documentation
- Backend must remain running throughout tests
- Celery worker must be active for flow 3 results
