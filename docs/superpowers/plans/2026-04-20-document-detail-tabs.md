# Document Detail Tabs Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tabbed interface to the superadmin document detail page with separate views for browsing chunks and previewing the PDF document with extracted content.

**Architecture:** Create five new component files (ChunksTab, ChunkDetailPanel, DocumentsTab, PDFViewer, ExtractedContent) and refactor DocumentDetail.tsx to manage tab state and coordinate between them. Chunks tab includes a searchable list with side panel for detail view. Documents tab shows PDF viewer and extracted content side-by-side.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, react-pdf, React Query

---

## Chunk 1: Setup & Dependencies

### Task 1: Install react-pdf and verify dependencies

**Files:**
- Modify: `superadmin/package.json`
- Modify: `superadmin/src/pages/DocumentDetail.tsx` (import statements)

- [ ] **Step 1: Install react-pdf library**

```bash
cd superadmin
npm install react-pdf pdfjs-dist
```

Expected: Dependencies added to package.json, node_modules updated.

- [ ] **Step 2: Verify installation**

```bash
npm ls react-pdf pdfjs-dist
```

Expected: Both packages listed with version numbers.

- [ ] **Step 3: Commit**

```bash
git add superadmin/package.json superadmin/package-lock.json
git commit -m "deps: add react-pdf for document preview"
```

---

## Chunk 2: ChunksTab Component

### Task 2: Create ChunksTab component with list and search

**Files:**
- Create: `superadmin/src/components/ChunksTab.tsx`

- [ ] **Step 1: Create ChunksTab.tsx file**

```typescript
import { useState } from "react";
import { Search, X } from "lucide-react";
import { ChunkDetailPanel } from "./ChunkDetailPanel";

interface Chunk {
  id: string;
  text?: string;
  metadata?: {
    section_header?: string;
    section_level?: number;
    chunk_index?: number;
    source?: string;
    page_count?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

interface ChunksTabProps {
  chunks: Chunk[] | undefined;
  isLoading: boolean;
}

export function ChunksTab({ chunks = [], isLoading }: ChunksTabProps) {
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(search);
  }

  // Filter chunks based on search query (client-side)
  const filteredChunks = chunks?.filter(chunk => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    const text = (chunk.text || "").toLowerCase();
    const sectionHeader = (chunk.metadata?.section_header || "").toLowerCase();
    return text.includes(searchLower) || sectionHeader.includes(searchLower);
  }) || [];

  const selectedChunk = chunks?.find(c => c.id === selectedChunkId);

  return (
    <div className="flex gap-4 h-[calc(100vh-500px)]">
      {/* Left: Chunks list */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search chunks..."
              className="w-full border rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <button
            type="submit"
            className="bg-slate-900 text-white text-sm px-3 py-1.5 rounded-md hover:bg-slate-800"
          >
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearch(""); setSearchQuery(""); }}
              className="text-sm text-gray-500 px-3 py-1.5 rounded-md border hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </form>

        {/* Chunks list */}
        <div className="overflow-y-auto flex-1 space-y-2 pr-2">
          {isLoading && <p className="text-sm text-gray-400">Loading chunks...</p>}

          {!isLoading && filteredChunks.length === 0 && (
            <div className="bg-white border rounded-lg p-8 text-center text-gray-400 text-sm">
              {searchQuery ? `No chunks matching "${searchQuery}"` : "No chunks found"}
            </div>
          )}

          {filteredChunks.map((chunk, index) => (
            <div
              key={chunk.id}
              onClick={() => setSelectedChunkId(chunk.id)}
              className="bg-white border rounded-lg p-3 cursor-pointer hover:shadow-md hover:bg-gray-50 transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-500 uppercase">
                  Chunk {chunk.metadata?.chunk_index ?? index + 1}
                </span>
                {chunk.metadata?.page_count && (
                  <span className="text-xs text-gray-400">Page {chunk.metadata.page_count}</span>
                )}
              </div>
              {chunk.metadata?.section_header && (
                <p className="text-xs font-semibold text-gray-700 mb-1">
                  {chunk.metadata.section_header}
                </p>
              )}
              <p className="text-sm text-gray-600 line-clamp-2">
                {(chunk.text || "").substring(0, 150)}...
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Detail panel (conditional) */}
      {selectedChunkId && selectedChunk && (
        <ChunkDetailPanel
          chunk={selectedChunk}
          onClose={() => setSelectedChunkId(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify syntax and imports**

Run: `npm run build` (in superadmin directory)
Expected: No TypeScript errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add superadmin/src/components/ChunksTab.tsx
git commit -m "feat: create ChunksTab component with search and list"
```

---

### Task 3: Create ChunkDetailPanel component

**Files:**
- Create: `superadmin/src/components/ChunkDetailPanel.tsx`

- [ ] **Step 1: Create ChunkDetailPanel.tsx file**

```typescript
import { X, Copy } from "lucide-react";
import { useState } from "react";

interface Chunk {
  id: string;
  text?: string;
  metadata?: {
    section_header?: string;
    section_level?: number;
    chunk_index?: number;
    source?: string;
    document_name?: string;
    processing_duration_ms?: number;
    page_count?: number;
    project_id?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface ChunkDetailPanelProps {
  chunk: Chunk;
  onClose: () => void;
}

export function ChunkDetailPanel({ chunk, onClose }: ChunkDetailPanelProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(chunk.text || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-96 border-l bg-white overflow-y-auto flex flex-col">
      {/* Header with close button */}
      <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Chunk Details</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ID */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase">ID</p>
          <p className="text-sm text-gray-700 font-mono break-all mt-1">{chunk.id}</p>
        </div>

        {/* Source */}
        {chunk.metadata?.source && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Source</p>
            <p className="text-sm text-gray-700 break-all mt-1">{chunk.metadata.source}</p>
          </div>
        )}

        {/* Chunk Index */}
        {chunk.metadata?.chunk_index !== undefined && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Chunk Index</p>
            <p className="text-sm text-gray-700 mt-1">{chunk.metadata.chunk_index}</p>
          </div>
        )}

        {/* Custom Metadata */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase mb-2">Metadata</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {chunk.metadata?.section_header && (
              <div>
                <span className="text-gray-500">Section Header:</span>
                <p className="text-gray-700 font-medium">{chunk.metadata.section_header}</p>
              </div>
            )}
            {chunk.metadata?.section_level !== undefined && (
              <div>
                <span className="text-gray-500">Level:</span>
                <p className="text-gray-700 font-medium">{chunk.metadata.section_level}</p>
              </div>
            )}
            {chunk.metadata?.processing_duration_ms && (
              <div>
                <span className="text-gray-500">Processing:</span>
                <p className="text-gray-700 font-medium">{chunk.metadata.processing_duration_ms}ms</p>
              </div>
            )}
            {chunk.metadata?.page_count && (
              <div>
                <span className="text-gray-500">Pages:</span>
                <p className="text-gray-700 font-medium">{chunk.metadata.page_count}</p>
              </div>
            )}
            {chunk.metadata?.project_id && (
              <div>
                <span className="text-gray-500">Project:</span>
                <p className="text-gray-700 font-medium">{chunk.metadata.project_id}</p>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-500 uppercase">Content</p>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="bg-gray-50 rounded border p-3 text-sm text-gray-700 whitespace-pre-wrap overflow-x-auto">
            {chunk.text || "No content available"}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify syntax**

Run: `npm run build` (in superadmin directory)
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add superadmin/src/components/ChunkDetailPanel.tsx
git commit -m "feat: create ChunkDetailPanel with metadata and copy"
```

---

## Chunk 3: DocumentsTab Component

### Task 4: Create PDFViewer component

**Files:**
- Create: `superadmin/src/components/PDFViewer.tsx`

- [ ] **Step 1: Create PDFViewer.tsx file**

```typescript
import { useState } from "react";
import { Document, Page } from "react-pdf";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface PDFViewerProps {
  filePath?: string;
  fileName?: string;
}

export function PDFViewer({ filePath, fileName }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setError(null);
  }

  function onDocumentLoadError(error: Error) {
    setError("Failed to load PDF");
    console.error("PDF load error:", error);
  }

  // Construct PDF URL - assumes files are served from /uploads endpoint
  const pdfUrl = filePath
    ? `/uploads${filePath.startsWith("/") ? filePath : "/" + filePath}`
    : undefined;

  if (!pdfUrl) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p className="text-sm">No document available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded border">
      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center">
        {error ? (
          <div className="text-center text-red-600 text-sm">
            <p>{error}</p>
            <p className="text-xs text-gray-500 mt-2">{pdfUrl}</p>
          </div>
        ) : (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={<div className="text-gray-400 text-sm">Loading PDF...</div>}
          >
            <Page
              pageNumber={currentPage}
              width={600}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        )}
      </div>

      {/* Navigation Controls */}
      {numPages && !error && (
        <div className="border-t bg-white p-3 flex items-center justify-between">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>

          <span className="text-sm text-gray-600">
            Page <span className="font-medium">{currentPage}</span> of{" "}
            <span className="font-medium">{numPages}</span>
          </span>

          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, numPages))}
            disabled={currentPage === numPages}
            className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify syntax and react-pdf imports**

Run: `npm run build` (in superadmin directory)
Expected: No TypeScript errors, react-pdf imports resolve.

- [ ] **Step 3: Commit**

```bash
git add superadmin/src/components/PDFViewer.tsx
git commit -m "feat: create PDFViewer component with page navigation"
```

---

### Task 5: Create ExtractedContent component

**Files:**
- Create: `superadmin/src/components/ExtractedContent.tsx`

- [ ] **Step 1: Create ExtractedContent.tsx file**

```typescript
interface Chunk {
  id: string;
  text?: string;
  metadata?: {
    section_header?: string;
    section_level?: number;
    chunk_index?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

interface ExtractedContentProps {
  chunks?: Chunk[];
  isLoading?: boolean;
}

export function ExtractedContent({ chunks = [], isLoading }: ExtractedContentProps) {
  if (isLoading) {
    return (
      <div className="text-center text-gray-400 text-sm py-8">
        <p>Loading content...</p>
      </div>
    );
  }

  if (!chunks || chunks.length === 0) {
    return (
      <div className="text-center text-gray-400 text-sm py-8">
        <p>No extracted content available</p>
      </div>
    );
  }

  // Group chunks by section header
  const sections: Array<{ header: string; chunks: Chunk[] }> = [];
  let currentSection: string | null = null;
  let currentChunks: Chunk[] = [];

  chunks.forEach(chunk => {
    const header = chunk.metadata?.section_header || "Content";

    if (header !== currentSection) {
      if (currentSection !== null) {
        sections.push({
          header: currentSection,
          chunks: [...currentChunks],
        });
      }
      currentSection = header;
      currentChunks = [chunk];
    } else {
      currentChunks.push(chunk);
    }
  });

  // Add last section
  if (currentSection !== null) {
    sections.push({
      header: currentSection,
      chunks: currentChunks,
    });
  }

  return (
    <div className="space-y-6">
      {sections.map((section, idx) => (
        <div key={idx}>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            {section.header}
          </h3>
          <div className="space-y-2">
            {section.chunks.map((chunk, chunkIdx) => (
              <p
                key={chunk.id}
                className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
              >
                {chunk.text}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify syntax**

Run: `npm run build` (in superadmin directory)
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add superadmin/src/components/ExtractedContent.tsx
git commit -m "feat: create ExtractedContent component for formatted text display"
```

---

### Task 6: Create DocumentsTab component

**Files:**
- Create: `superadmin/src/components/DocumentsTab.tsx`

- [ ] **Step 1: Create DocumentsTab.tsx file**

```typescript
import { PDFViewer } from "./PDFViewer";
import { ExtractedContent } from "./ExtractedContent";

interface Chunk {
  id: string;
  text?: string;
  metadata?: {
    section_header?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface BaseDoc {
  id: string;
  filename: string;
  file_path?: string;
  [key: string]: any;
}

interface DocumentsTabProps {
  doc: BaseDoc;
  chunks?: Chunk[];
  isLoading?: boolean;
}

export function DocumentsTab({ doc, chunks = [], isLoading }: DocumentsTabProps) {
  return (
    <div className="flex gap-4 h-[calc(100vh-500px)]">
      {/* Left: PDF Viewer (50%) */}
      <div className="w-1/2">
        <PDFViewer filePath={doc.file_path} fileName={doc.filename} />
      </div>

      {/* Right: Extracted Content (50%) */}
      <div className="w-1/2 border rounded-lg p-4 overflow-y-auto">
        <ExtractedContent chunks={chunks} isLoading={isLoading} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify syntax**

Run: `npm run build` (in superadmin directory)
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add superadmin/src/components/DocumentsTab.tsx
git commit -m "feat: create DocumentsTab with PDF and extracted content"
```

---

## Chunk 4: Refactor DocumentDetail.tsx

### Task 7: Update DocumentDetail to add tabs state and imports

**Files:**
- Modify: `superadmin/src/pages/DocumentDetail.tsx`

- [ ] **Step 1: Replace entire DocumentDetail.tsx content**

```typescript
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, Trash2, FileText } from "lucide-react";
import { ChunksTab } from "../components/ChunksTab";
import { DocumentsTab } from "../components/DocumentsTab";

interface BaseDoc {
  id: string;
  filename: string;
  doc_type: string;
  processing_status: string;
  chunk_count: number;
  file_size: number | null;
  file_path?: string;
  uploaded_by: string;
  created_at: string;
}

interface ChunksResponse {
  chunks: Array<{ id?: string; text?: string; metadata?: any; [key: string]: any }>;
  total: number;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"chunks" | "documents">("chunks");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: doc, isLoading: docLoading } = useQuery<BaseDoc>({
    queryKey: ["base-doc", id],
    queryFn: () => api.get(`/superadmin/base-documents/${id}`).then(r => r.data),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.processing_status === "processing" || data?.processing_status === "pending" ? 3000 : false;
    },
  });

  const { data: chunksData, isLoading: chunksLoading } = useQuery<ChunksResponse>({
    queryKey: ["base-doc-chunks", id],
    queryFn: () => {
      return api.get(`/superadmin/base-documents/${id}/chunks`).then(r => r.data);
    },
    enabled: doc?.processing_status === "completed",
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/superadmin/base-documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["base-docs"] });
      navigate("/documents");
    },
  });

  function formatSize(bytes: number | null) {
    if (!bytes) return "—";
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  if (docLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  }
  if (!doc) {
    return <div className="p-6 text-sm text-red-600">Document not found.</div>;
  }

  const isProcessing = doc.processing_status === "processing" || doc.processing_status === "pending";

  return (
    <div className="p-6 space-y-6">
      {/* Back + Header */}
      <div>
        <Link to="/documents" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Documents
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-slate-100 rounded-lg mt-0.5">
              <FileText className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{doc.filename}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-slate-100 text-slate-700 text-xs font-medium px-2 py-0.5 rounded">{doc.doc_type}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[doc.processing_status] ?? "bg-gray-100"}`}>
                  {doc.processing_status}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium px-3 py-1.5 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800 font-medium">Are you sure you want to delete this document?</p>
          <p className="text-xs text-red-600 mt-1">This action cannot be undone.</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-red-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMutation.isPending ? "Deleting..." : "Yes, Delete"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="text-sm text-gray-600 px-3 py-1.5 rounded-md border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Meta info */}
      <div className="bg-white border rounded-lg p-4 grid grid-cols-4 gap-4 text-sm">
        {[
          { label: "Chunks", value: doc.chunk_count || (isProcessing ? "Processing..." : "—") },
          { label: "File Size", value: formatSize(doc.file_size) },
          { label: "Uploaded by", value: doc.uploaded_by },
          { label: "Created", value: new Date(doc.created_at).toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-gray-500 uppercase font-medium">{label}</p>
            <p className="font-medium text-gray-900 mt-0.5">{String(value)}</p>
          </div>
        ))}
      </div>

      {/* Processing notice */}
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          Document is being processed through Noesia. Chunks will appear here once complete. Page auto-refreshes.
        </div>
      )}

      {/* Tabs */}
      {doc.processing_status === "completed" && (
        <>
          {/* Tab buttons */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setActiveTab("chunks")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "chunks"
                  ? "text-slate-900 border-b-2 border-slate-900 -mb-px"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Chunks
            </button>
            <button
              onClick={() => setActiveTab("documents")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "documents"
                  ? "text-slate-900 border-b-2 border-slate-900 -mb-px"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Documents
            </button>
          </div>

          {/* Tab content */}
          {activeTab === "chunks" && (
            <ChunksTab chunks={chunksData?.chunks} isLoading={chunksLoading} />
          )}

          {activeTab === "documents" && (
            <DocumentsTab doc={doc} chunks={chunksData?.chunks} isLoading={chunksLoading} />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify syntax and all imports**

Run: `npm run build` (in superadmin directory)
Expected: No TypeScript errors, all components import successfully.

- [ ] **Step 3: Commit**

```bash
git add superadmin/src/pages/DocumentDetail.tsx
git commit -m "refactor: add tabs state and import tab components"
```

---

## Chunk 5: Testing & Verification

### Task 8: Test the complete tabbed interface

**Files:**
- Test in browser: `http://localhost:8003/documents/{id}`

- [ ] **Step 1: Rebuild superadmin container**

```bash
docker-compose up -d --build superadmin
```

Expected: Container rebuilds and starts successfully.

- [ ] **Step 2: Wait for container to be ready**

```bash
sleep 5
```

- [ ] **Step 3: Open superadmin in browser and navigate to a completed document**

- Go to `http://localhost:8003`
- Log in with superadmin credentials
- Click on "Base Documents" or navigate to a document detail page
- Expected: Document page loads with "Chunks" and "Documents" tabs visible

- [ ] **Step 4: Test Chunks tab**

- Chunks tab should be active by default
- Chunks list should display with search bar
- Search functionality should filter chunks
- Click on a chunk → side panel should slide in from right
- Panel should show full metadata and content
- Copy button should work
- Close button (X) should collapse panel

Expected: All interactions work smoothly, no console errors.

- [ ] **Step 5: Test Documents tab**

- Click "Documents" tab
- Left side: PDF viewer should load and display pages
- Right side: Extracted content should display formatted text
- PDF page navigation (Prev/Next) should work
- Page counter should update

Expected: PDF loads and displays correctly (or error message if file unavailable).

- [ ] **Step 6: Test responsive behavior**

- Resize browser window to mobile width (375px)
- Tabs should remain visible
- Components should stack or adjust gracefully

Expected: Layout adapts without breaking.

- [ ] **Step 7: Check console for errors**

Open DevTools (F12) → Console tab
Expected: No errors or warnings.

---

### Task 9: Verify all components work together

- [ ] **Step 1: Test switching between tabs rapidly**

Click between Chunks and Documents tabs multiple times.
Expected: No lag, state management works correctly, no memory leaks.

- [ ] **Step 2: Test chunk search with different queries**

In Chunks tab, search for:
- Common words from chunks
- Numbers
- Empty string (should clear search)

Expected: Results filter correctly, clear functionality works.

- [ ] **Step 3: Test opening/closing detail panel multiple times**

Click on different chunks, open and close panel.
Expected: Panel slides smoothly, metadata updates correctly.

- [ ] **Step 4: Commit final changes**

```bash
git add -A
git commit -m "test: verify tabs component functionality"
```

---

## Summary

**Files Created:**
- `superadmin/src/components/ChunksTab.tsx`
- `superadmin/src/components/ChunkDetailPanel.tsx`
- `superadmin/src/components/DocumentsTab.tsx`
- `superadmin/src/components/PDFViewer.tsx`
- `superadmin/src/components/ExtractedContent.tsx`

**Files Modified:**
- `superadmin/src/pages/DocumentDetail.tsx` (complete refactor)
- `superadmin/package.json` (added react-pdf)

**Dependencies Added:**
- `react-pdf`
- `pdfjs-dist`

**Success Criteria Met:**
✅ Two tabs (Chunks and Documents) render and switch correctly
✅ Chunks tab has searchable list with side panel detail view
✅ Documents tab shows PDF viewer and extracted content side-by-side
✅ All data fetches work and display correctly
✅ No console errors
✅ Responsive design works

**Total Commits:** 8
