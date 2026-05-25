# Compliance Chat Bot Design

## Goal

Add an AI chat assistant to Mizan that lets users ask natural-language questions about their compliance documents, regulation articles, and compliance findings. The assistant uses a DMS-style agentic tool-calling loop with SSE streaming and LiteLLM.

## Architecture

Four units:

1. **`backend/app/api/v1/compliance_chat.py`** (new) — Agentic SSE chat endpoint.
2. **`backend/app/main.py`** (modify) — Register the new router.
3. **`backend/app/db/models/document.py` + migration** (modify) — Add `qdrant_collection_name` column to `MizanDocument` so the chat endpoint can look up the correct Qdrant collection at query time.
4. **`backend/app/tasks/process_user_document.py`** (modify) — Store the generated collection name on the document record immediately after the Noesia ingest job is created.
5. **Frontend wiring** — Rewrite `ChatInterface.tsx` props/logic to call the real backend, add `FloatingChatButton` to the root layout, wire the existing "Start Chat" button.

No new database tables for chat. Chat history stored in browser localStorage.

---

## Pre-Requisite: Store Qdrant Collection Name

**Problem:** Each user document is ingested into a randomly-named Qdrant collection (`user_doc_{hex8}`) generated at ingest time (`process_user_document.py:80`). This name is never persisted, so the chat endpoint has no way to look up which Qdrant collection to search for a given document.

**Fix:**

1. Add column to `MizanDocument`:
   ```python
   qdrant_collection_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
   ```

2. In `process_user_document.py`, after generating `collection_name` (line 80), save it:
   ```python
   collection_name = f"user_doc_{uuid.uuid4().hex[:8]}"
   doc.qdrant_collection_name = collection_name   # ← add this line
   await db.commit()                              # ← commit before ingest so name survives failures
   ```

   The commit must happen **before** calling `ingest_documents()`. If the ingest job fails and the exception handler commits `processing_status = "failed"`, the collection name will already be persisted. This allows a future retry or the chat endpoint to still find the name even on partial failure.

3. Create Alembic migration `008_add_qdrant_collection_name.py`.

4. For `BaseDocument` (regulation docs), the collection name is the constant `"mizan_base_documents"` defined in `process_base_document.py:17` — no column needed.

---

## Backend: `compliance_chat.py`

### Endpoint

```
POST /api/v1/ai/chat
Authorization: Bearer <JWT>
Content-Type: application/json
Response: text/event-stream (SSE)
```

### Request Body

```json
{
  "messages": [
    { "role": "user", "content": "What does the policy say about overtime?" }
  ],
  "document_id": "uuid-optional",
  "comparison_id": "uuid-optional"
}
```

- `messages` — Full conversation history in OpenAI format (user/assistant/tool roles).
- `document_id` — Optional. Scopes Qdrant search to that document's chunks. Enables `mizan_get_document_info`, `mizan_get_articles`, `mizan_get_article_detail`.
- `comparison_id` — Optional. Enables `mizan_get_compliance_findings` and `mizan_get_compliance_report`. When provided, the endpoint fetches the ComplianceComparison record at request start to resolve both `mizan_document_id` and `base_document_id`, verified to belong to the authenticated user's tenant.

### Context Resolution at Request Start

Before entering the agent loop:

1. If `document_id` provided → fetch `MizanDocument` by id, verify `tenant_id == user.tenant_id`. If not found or wrong tenant → HTTP 404.
2. If `comparison_id` provided → fetch `ComplianceComparison`, verify `tenant_id == user.tenant_id`. If not found or wrong tenant → HTTP 404. From this record, resolve `mizan_document_id` and `base_document_id` (used by tools).
3. Fetch `ComplianceReport` for the comparison (if comparison_id provided) — extract `compliance_score`, `total_findings`, `critical_count` for the context prompt injection.

### System Prompt

```
You are a senior compliance analyst assistant for Mizan, an AI compliance platform.
You help users understand their policy documents, the regulations they must comply with,
and the findings from compliance analysis.

Guidelines:
- Always call a search or retrieval tool before referencing specific article text.
- When citing a law article or policy section, quote the exact text you found.
- Be concise and precise. Reference article numbers when relevant.
- If you cannot find what the user asked about, say so clearly.
- Do not invent article numbers or compliance scores.
```

If `document_id` or `comparison_id` provided, append:
```
Context: You are reviewing policy document "{document_name}".
It is being assessed against regulation "{regulation_filename}".
Overall compliance score: {score}%. Total gaps found: {total_findings} ({critical_count} critical).
```
(Omit the compliance lines if no `comparison_id`.)

### Agent Loop

Runs up to **8 iterations**:

1. Call `llm.chat_with_tools(messages, tools)` — non-streaming, returns `(text, tool_calls)`.
2. If `tool_calls` returned:
   - Stream a `tool_use` SSE event for each tool call.
   - Execute each tool (DB query or Qdrant search). Collect results.
   - Stream a `tool_done` SSE event for each completed tool.
   - Append assistant message (with tool_calls) + tool result messages to `messages`.
   - Continue loop.
3. If `text` returned (no tool calls — final response ready):
   - Discard the text returned by `chat_with_tools`. Call `llm.chat_stream(messages)` **without a tools parameter** to obtain a true token stream. This avoids the non-streaming limitation of `chat_with_tools` for the final response.
   - Yield each token from `chat_stream` as a `token` SSE event.
   - Emit `sources` SSE event (omitted if no search tools ran during this session).
   - Emit `done` SSE event. Exit loop.
4. **Termination guard:** If iteration 8 produces tool calls instead of text, break the loop and emit a `done` event with no text. Do not emit an error — the LLM simply ran out of budget.

### Tools (6, all read-only)

**Security for all tools:** Any DB query involving `MizanDocument`, `ComplianceComparison`, `ComplianceFinding`, or `ComplianceReport` must filter by the authenticated user's `tenant_id`. `BaseDocument` and `BaseDocumentArticle` are global (no tenant filter). If a tool receives an ID that fails the tenant check, it returns `{"error": "not found"}` as the tool result JSON — this allows the LLM to respond gracefully rather than crashing the stream.

---

#### `mizan_search`

Semantic search via Qdrant across document chunks.

- **Inputs:** `query` (str, required), `document_id` (str, optional — scope to one document), `document_type` (str, optional — `"policy"` | `"regulation"`, only meaningful with `document_id`)
- **Behaviour:**
  - If `document_type == "regulation"` or no `document_id`: search Qdrant collection `"mizan_base_documents"`, metadata filter `object_id = base_document_id` (from comparison context, or omit filter for global search). Note: `object_id` is confirmed as the Qdrant payload key — `scroll_chunks_by_doc_id` in `qdrant_search.py` already uses this same field.
  - If `document_type == "policy"` and `document_id`: look up `MizanDocument.qdrant_collection_name` for that document, search that Qdrant collection. If `qdrant_collection_name` is null (document ingested before this feature), fall back to full-text ILIKE search on `mizan_document_chunks.text` filtered by `mizan_document_id`.
  - Explicitly pass `top_k=5` to `qdrant_search.search()`.
- **Returns:** top-5 results, each `{ text, section_header, document_name, score }`. Accumulated into the session's `sources` list (deduplicated by chunk id, keeping highest score).

---

#### `mizan_get_document_info`

Fetch metadata for a document.

- **Inputs:** `document_id` (str, required), `document_type` (str, required — `"policy"` | `"regulation"`)
- **Behaviour:**
  - If `"policy"`: query `MizanDocument` by id, verify `tenant_id`. Return name, file_type, page_count, word_count, article count (from `mizan_document_articles`), ai_summary, processing_status.
  - If `"regulation"`: query `BaseDocument` by id (no tenant check). Return filename, articles_status, article count (from `base_document_articles`).
- **Returns:** `{ name, type, page_count, word_count, article_count, summary, status }`. `summary` and `page_count` may be null for older documents.

---

#### `mizan_get_articles`

List articles from a document with previews.

- **Inputs:** `document_id` (str, required), `document_type` (str, required — `"policy"` | `"regulation"`), `offset` (int, default 0), `limit` (int, default 20, max 50)
- **Behaviour:**
  - If `"policy"`: query `MizanDocumentArticle` where `mizan_document_id = document_id`, order by `article_index`, offset/limit.
  - If `"regulation"`: query `BaseDocumentArticle` where `base_document_id = document_id`, order by `article_index`, offset/limit.
  - `limit` is server-clamped to 50 regardless of the value the LLM passes.
- **Returns:** `{ total, articles: [{ article_number, preview }] }` where `preview` is the first 200 chars of `article_text`.

---

#### `mizan_get_article_detail`

Get the full text of one article by its number.

- **Inputs:** `document_id` (str, required), `document_type` (str, required — `"policy"` | `"regulation"`), `article_number` (str, required)
- **Behaviour:** Query the appropriate articles table with exact match on `article_number`. Case-sensitive match first; if not found, try case-insensitive.
- **Returns:** `{ article_number, article_text }` or `{ error: "Article {number} not found" }` if absent.

---

#### `mizan_get_compliance_findings`

Get all compliance findings for a comparison.

- **Inputs:** `comparison_id` (str, required), `status_filter` (str, optional — `"gap"` | `"compliant"` | `"not_applicable"`)
- **Behaviour:** Query `ComplianceFinding` where `comparison_id = comparison_id`. Verify `ComplianceComparison.tenant_id == user.tenant_id` (already done at request start if `comparison_id` was in the request body; if called with a different id, re-verify). Apply `status_filter` if provided. Sort by `doc_b_section` with best-effort numeric ordering: `ORDER BY CASE WHEN doc_b_section ~ '^[0-9]+$' THEN CAST(doc_b_section AS INTEGER) ELSE 9999 END, doc_b_section` — non-numeric values (e.g., `"Annex A"`, `"—"`) sort to the end.
- **Returns:** `{ total, findings: [{ doc_b_section, doc_a_section, status, severity, issue, recommendation, coverage_score }] }`.

---

#### `mizan_get_compliance_report`

Get the compliance report summary.

- **Inputs:** `comparison_id` (str, required)
- **Behaviour:** Query `ComplianceReport` where `comparison_id = comparison_id`. Verify tenant via associated `ComplianceComparison`.
- **Returns:** `{ compliance_score, total_findings, critical_count, medium_count, low_count, summary, executive_summary, risk_assessment }`. `executive_summary` and `risk_assessment` may be null if narratives were not generated.

---

### SSE Event Types

| Event | Payload | When |
|---|---|---|
| `token` | `{ content: "..." }` | Each text token from LLM final response |
| `tool_use` | `{ name: "...", label: "..." }` | Tool starting (label is human-readable, e.g., "Searching documents…") |
| `tool_done` | `{ name: "..." }` | Tool completed |
| `sources` | `[{ text, document_name, score }]` | After final response, only if `mizan_search` was called at least once |
| `done` | `{}` | Stream complete (always emitted, even on empty response) |
| `error` | `{ message: "..." }` | Unrecoverable error (malformed request, DB failure) |

SSE format (each event):
```
data: {"type": "token", "content": "The policy"}\n\n
```

---

## Frontend Wiring

### 1. Zustand Chat Store (new file)

Because `ChatPanel` lives in `AppLayout` and the "Start Chat" button is two components deep inside a page, prop-drilling is not feasible. A one-line Zustand store is the cleanest solution:

**`frontend/src/stores/chatStore.ts`** (new):

```ts
import { create } from 'zustand';

interface ChatStore {
  open: boolean;
  openChat: () => void;
  closeChat: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  open: false,
  openChat: () => set({ open: true }),
  closeChat: () => set({ open: false }),
}));
```

Both `AppLayout` and any page component can import `useChatStore` independently — no prop threading needed.

### 2. Root Layout — Add Floating Button

**`frontend/src/components/ui/app-layout.tsx`** (`AppLayout` component) receives two additions:

```tsx
const { open, openChat, closeChat } = useChatStore();

// In JSX:
<FloatingChatButton onOpenChat={openChat} />
<ChatPanel open={open} onClose={closeChat} />
```

`FloatingChatButton` already uses the `onOpenChat` prop — no prop name change needed.

`ChatPanel` is a thin wrapper that renders `ChatInterface` inside a slide-over drawer (positioned fixed, right side, full height). Use the existing shadcn/ui `Sheet` component for this.

### 2. ChatInterface — Full Rewrite of Logic (UI unchanged)

`frontend/src/components/chat/ChatInterface.tsx` keeps its current visual design (message list, input box, tool chips, sources panel) but its internal logic is fully replaced:

**New props interface:**
```tsx
interface ChatInterfaceProps {
  open: boolean;
  onClose: () => void;
}
```

**Context detection (inside the component):**
```tsx
const { documentId } = useParams<{ documentId: string }>();
const [searchParams] = useSearchParams();
const comparisonId = searchParams.get("comparison_id") ?? undefined;
```

Note: `useParams` works correctly here because `AppLayout` is NOT a layout route. In `App.tsx`, each route renders its own `<AppLayout>` instance inline (e.g. `element={<AppLayout><PageComponent /></AppLayout>}`), so `ChatInterface` inside `AppLayout` always lives within the matched route's context and `useParams` returns the current route's params.

**localStorage key:**
- On a comparison page (`comparisonId` set): `mizan-chat-v1-comparison-{comparisonId}`
- On a document page (`documentId` set, no comparison): `mizan-chat-v1-doc-{documentId}`
- Anywhere else: `mizan-chat-v1-global`

**Stored shape:** `{ messages: ApiMessage[], updatedAt: string }` where `ApiMessage = { role: "user" | "assistant" | "tool", content: string, tool_calls?: ..., tool_call_id?: string }`.

**API call:**
```tsx
const response = await fetch('/api/v1/ai/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ messages: apiMessages, document_id: documentId, comparison_id: comparisonId }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
// Read chunks, split on "\n\n", parse "data: {...}" lines
// Dispatch by event type:
//   token    → append content to current assistant message
//   tool_use → add spinning tool chip
//   tool_done → mark chip complete
//   sources  → populate sources panel
//   done     → mark message as complete, save to localStorage
//   error    → show error state in message
```

**Display messages vs API messages:** Maintain two parallel arrays (same pattern as DMS):
- `displayMessages` — for rendering (includes tool chips, sources, loading state)
- `apiMessages` — for sending to API (clean OpenAI format, what gets persisted to localStorage)

### 4. Start Chat Button — Wire Up

The "Start Chat" button in `ComplianceAnalysisResults.tsx` (inside the "AI Compliance Assistant" card in the right sidebar) is currently a stub. Two changes:

- `ComplianceAnalysisResults` receives a new optional prop `onStartChat?: () => void`.
- The button gets `onClick={onStartChat}`.
- `ComplianceAnalysisView.tsx` calls `const { openChat } = useChatStore()` and passes `onStartChat={openChat}` to `ComplianceAnalysisResults`. No prop threading through `AppLayout` needed.

---

## File Map

| File | Action | Notes |
|---|---|---|
| `backend/app/api/v1/compliance_chat.py` | Create | New agentic SSE endpoint |
| `backend/app/main.py` | Modify | Register `compliance_chat.router` |
| `backend/app/db/models/document.py` | Modify | Add `qdrant_collection_name` to `MizanDocument` |
| `backend/alembic/versions/008_add_qdrant_collection_name.py` | Create | Alembic migration |
| `backend/app/tasks/process_user_document.py` | Modify | Store `collection_name` on `doc` after generating it |
| `frontend/src/stores/chatStore.ts` | Create | Zustand store for chat open/close state |
| `frontend/src/components/chat/ChatInterface.tsx` | Rewrite logic | Keep visual design, replace mock data with real SSE |
| `frontend/src/components/ui/app-layout.tsx` | Modify | Add `FloatingChatButton` + `ChatPanel` state |
| `frontend/src/pages/ComplianceAnalysisResults.tsx` | Modify | Wire "Start Chat" button via `onStartChat` prop |
| `frontend/src/pages/ComplianceAnalysisView.tsx` | Modify | Pass `onStartChat` prop to Results component |

---

## Out of Scope

- Write tools (create, update, delete) — read-only chat only.
- Tool confirmation flow — not needed without write tools.
- DB persistence of chat history — localStorage is sufficient.
- Multi-document comparison chat (more than one policy + one regulation).
- Streaming the tool-calling phase — tools execute non-streaming; only final text streams token by token.
