# Article-Based Compliance Comparison Design

**Goal:** Replace chunk-based compliance comparison with article-based comparison, using regulation articles as the primary unit of analysis.

**Architecture:** Regulation-driven loop — iterate over each base document article, compare against all mizan document articles as context. One LLM call per regulation article. Guard prevents analysis when articles are not yet extracted.

**Tech Stack:** Python/FastAPI backend, Celery task, SQLAlchemy, LiteLLM, React frontend.

---

## Algorithm

### Input
- `BaseDocumentArticle[]` — regulation requirements (the loop driver)
- `MizanDocumentArticle[]` — compliance doc articles (formatted once as context)

### Per-article LLM prompt
```
REGULATORY REQUIREMENT:
[{article_number}] {article_text}

COMPLIANCE DOCUMENT ARTICLES:
[{article_number}] {article_text}
...all mizan articles...

Determine if this regulatory requirement is satisfied by the compliance document.
```

### LLM response (JSON)
```json
{
  "status": "compliant|gap|missing",
  "severity": "critical|medium|low",
  "issue": "description of gap or conflict",
  "recommendation": "what needs to change",
  "compliance_articles": ["Article 12", "Article 15"]
}
```

### Output mapping
- `ComplianceFinding.doc_a_section` = base article number (e.g. "Article 5")
- `ComplianceFinding.doc_b_section` = matched compliance article numbers (joined string)
- `ComplianceComparison.current_chunk` / `total_chunks` = article progress (no schema change)

---

## Guard: Block Analysis if Articles Not Ready

### Backend (`POST /documents/{id}/analyze`)
The mizan doc is fetched by `doc_id`. Base doc is fetched via `mizan_doc.base_document_id` FK.
Check before queuing the task:
1. `mizan_doc.articles_status != "completed"` → 400: "Your document's articles have not been extracted yet. Please wait for extraction to complete."
2. `base_doc.articles_status != "completed"` → 400: "The regulation document's articles have not been extracted yet."

### Frontend
- Catch 400 from analyze call
- Show modal with the error message and a Close button
- No change to happy path

---

## Files Changed

| File | Change |
|---|---|
| `backend/app/tasks/compare_documents.py` | Load articles instead of chunks; loop over base articles |
| `backend/app/services/compliance_comparator.py` | New `prepare_compliance_doc(articles)` and `compare_article(base_article, compliance_text)` methods |
| `backend/app/api/v1/documents.py` | Guard in `POST /{id}/analyze` |
| `frontend/src/pages/Documents.tsx` | Catch 400 from analyze, show modal |

---

## Error Handling

- If base doc has 0 articles after extraction: fail comparison with clear error stored in `ComplianceComparison.error_message`
- If mizan doc has 0 articles: same
- Individual LLM call failures: log warning, create a finding with status="gap" and note the parse error; continue loop
