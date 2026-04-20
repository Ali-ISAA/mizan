# Document Detail Tabs UI Design

**Goal:** Add tabbed interface to the superadmin document detail page with separate views for chunks browsing and PDF document preview.

**Architecture:** Two independent tab components (ChunksTab and DocumentsTab) managed by parent DocumentDetail page using React state. ChunksTab includes a side panel for detailed chunk viewing. DocumentsTab shows PDF viewer alongside extracted content.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, shadcn/ui, react-pdf, React Query

---

## 1. Components Overview

### 1.1 DocumentDetail.tsx (Parent)
**Responsibility:** Manage tab state, fetch document and chunks data, coordinate between tabs.

**State:**
- `activeTab` — "chunks" | "documents" (default: "chunks")
- `doc` — BaseDocument metadata (existing query)
- `chunksData` — Array of chunks from API (existing query)

**Props passed to children:**
- ChunksTab receives: `doc`, `chunksData`, `isLoading`
- DocumentsTab receives: `doc`, `chunksData`, `isLoading`

**Structure:**
```
<DocumentDetail>
  {/* Header: filename, status, delete button (unchanged) */}
  
  {/* Metadata grid (unchanged) */}
  
  {/* Tab buttons */}
  <div className="flex gap-2">
    <button onClick={() => setActiveTab("chunks")}>Chunks</button>
    <button onClick={() => setActiveTab("documents")}>Documents</button>
  </div>
  
  {/* Tab content */}
  {activeTab === "chunks" && <ChunksTab ... />}
  {activeTab === "documents" && <DocumentsTab ... />}
</DocumentDetail>
```

### 1.2 ChunksTab.tsx
**Responsibility:** Display searchable chunk list with detail side panel.

**State:**
- `selectedChunkId` — UUID of chunk to show in detail panel (null = no panel)
- `search` — Search query text
- `searchQuery` — Debounced search query for filtering

**Features:**
- Search bar with input, Search button, Clear button
- Chunk cards displayed as list, each showing:
  - Badge: "Chunk N"
  - Section header (if available) as subheading
  - First 150 chars of text (truncated with "...")
  - Page number badge (optional)
  - Cursor pointer, hover state
- Click chunk card → opens side panel
- Side panel slides in from right (35% width)
- Side panel content (ChunkDetailPanel sub-component):
  - Close button (X) top-right
  - Full metadata displayed:
    - ID, Source filename, Chunk index
    - Custom metadata (section_header, section_level, processing_duration_ms, page_count, project_id)
  - Full chunk text (preserves formatting)
  - Copy button to copy text to clipboard
- Background list gets slight blur/opacity when panel open
- Empty state: "No chunks found" or "No chunks matching X"

**Layout:**
```
<div className="flex gap-4">
  {/* Left: chunk list (65%) */}
  <div>
    <SearchBar />
    <ChunkCards 
      chunks={filteredChunks}
      onSelectChunk={setSelectedChunkId}
    />
  </div>
  
  {/* Right: detail panel (35%, conditional) */}
  {selectedChunkId && (
    <ChunkDetailPanel 
      chunk={selectedChunk}
      onClose={() => setSelectedChunkId(null)}
    />
  )}
</div>
```

### 1.3 DocumentsTab.tsx
**Responsibility:** Display PDF viewer and extracted content side-by-side.

**Sub-components:**
- **PDFViewer** — Left side
- **ExtractedContent** — Right side

**PDFViewer:**
- Uses `react-pdf` library (`pdfjs-dist`)
- Shows file from `doc.file_path` or direct download URL
- Display current page as canvas/image
- Bottom controls: page counter ("Page X of Y"), prev/next buttons
- Keyboard navigation (arrow keys)
- Auto-fit to container width

**ExtractedContent:**
- Groups chunks by section header
- Renders sections as:
  ```
  <section>
    <h3>{section_header}</h3>
    <div className="prose">{joined chunk texts}</div>
  </section>
  ```
- Scroll independently from PDF
- Searchable via Ctrl+F (browser native)
- Copy-able text

**Layout:**
```
<div className="flex gap-4 h-[calc(100vh-400px)]">
  {/* Left: PDF (50%) */}
  <div className="w-1/2 border rounded-lg overflow-hidden">
    <PDFViewer doc={doc} />
  </div>
  
  {/* Right: Extracted content (50%) */}
  <div className="w-1/2 border rounded-lg overflow-y-auto p-4">
    <ExtractedContent chunks={chunksData} />
  </div>
</div>
```

---

## 2. Data Flow

```
API Response (existing):
  GET /superadmin/base-documents/{id}
    → BaseDocument { id, filename, processing_status, chunk_count, ... }

  GET /superadmin/base-documents/{id}/chunks?q=...
    → { chunks: [ { id, text, metadata: { section_header, ... } }, ... ], total }

DocumentDetail (parent)
  ├─ useQuery(base-docs/{id}) → doc
  ├─ useQuery(base-docs/{id}/chunks) → chunksData
  └─ useState(activeTab) → "chunks" | "documents"
      ├─ if "chunks": render ChunksTab(doc, chunksData)
      │   ├─ useState(selectedChunkId) → triggers ChunkDetailPanel
      │   └─ useState(search, searchQuery) → filters chunks client-side
      └─ if "documents": render DocumentsTab(doc, chunksData)
          ├─ PDFViewer queries file from backend
          └─ ExtractedContent formats and displays chunksData
```

---

## 3. Tab Styling

**Tab buttons:**
- Two buttons: "Chunks" and "Documents"
- Active tab: dark background (slate-900), white text
- Inactive tab: light background (slate-100), gray text
- Hover effect on inactive tabs
- Positioned above content area, with bottom border

**Chunk cards:**
- White background, light border, rounded corners
- Hover: subtle background color change, shadow increase, cursor pointer
- Spacing: 8px gaps between cards
- Responsive: full width on mobile, grid-cols-1 on mobile → single column

**Side panel (ChunksTab):**
- Fixed or sticky right side
- Background: white, bordered on left
- Shadow for depth
- Smooth slide-in animation (transition: 200ms)
- Close button (X) positioned top-right, inside padding
- Content scrollable if metadata + text exceeds viewport height

**PDF + Content layout (DocumentsTab):**
- Two equal columns (50/50 split on desktop)
- Stack vertically on mobile/tablet
- PDF viewer fills left container (aspect ratio preserved)
- Extracted content scrollable independently
- Dark text on white background for readability

---

## 4. Implementation Notes

### 4.1 New Dependencies
- `react-pdf` (v9+) for PDF viewing
- `pdfjs-dist` (peer dependency of react-pdf)

### 4.2 File Path / PDF Access
- The backend stores `file_path` in BaseDocument
- Need to verify: Is the file accessible via HTTP endpoint or should we serve it?
- Option: Create `/api/v1/superadmin/base-documents/{id}/download` endpoint to serve PDF
- Or: Store file in public bucket and use direct URL

### 4.3 Search Filtering
- Client-side filtering on chunks (already works in current implementation)
- No backend changes needed
- Debounce search input to avoid excessive re-renders

### 4.4 Responsive Design
- Desktop: Side-by-side layouts (chunks list + panel, or PDF + content)
- Tablet: Stack or reduce column widths
- Mobile: Full-width tabs, stack vertically

### 4.5 Error Handling
- PDF viewer: Show error message if file fails to load
- Chunks: Show "No chunks found" if empty or search returns nothing
- Both tabs gracefully degrade if data unavailable

### 4.6 Accessibility
- Tab buttons: proper ARIA roles (`role="tab"`, `aria-selected`)
- Side panel: focus trap within panel when open, restore focus on close
- Keyboard navigation: Tab key moves between focusable elements
- Screen reader friendly headings and descriptions

---

## 5. Success Criteria

- ✅ Two tabs render correctly and switch without page reload
- ✅ Chunks tab displays all chunks with search working
- ✅ Clicking chunk card opens side panel with full details
- ✅ Documents tab shows PDF viewer and extracted content side-by-side
- ✅ PDF pages navigate correctly (prev/next buttons + keyboard)
- ✅ All data fetches work and display correctly
- ✅ Responsive design works on mobile/tablet/desktop
- ✅ No console errors or warnings
- ✅ Animations are smooth (200ms transitions)

---

## 6. Files to Create/Modify

**Create:**
- `superadmin/src/components/ChunksTab.tsx`
- `superadmin/src/components/ChunkDetailPanel.tsx` (or inline in ChunksTab)
- `superadmin/src/components/DocumentsTab.tsx`
- `superadmin/src/components/PDFViewer.tsx`
- `superadmin/src/components/ExtractedContent.tsx`

**Modify:**
- `superadmin/src/pages/DocumentDetail.tsx` (add tabs, refactor chunks display into ChunksTab)

**Optional:**
- `backend/app/api/v1/base_documents.py` (add `/download` endpoint if needed for PDF access)
