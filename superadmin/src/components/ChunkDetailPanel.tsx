import { X, Copy } from "lucide-react";
import { useState } from "react";

interface Chunk {
  id?: string;
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

export function ChunkDetailPanel({ chunk, onClose }: { chunk: Chunk; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(chunk.text || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-96 border-l border-border bg-card overflow-y-auto flex flex-col">
      <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">Chunk Details</h3>
        <button onClick={onClose} className="text-text-muted hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">ID</p>
          <p className="text-xs text-foreground font-mono break-all">{chunk.id}</p>
        </div>

        {chunk.metadata?.source && (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Source</p>
            <p className="text-sm text-foreground break-all">{chunk.metadata.source}</p>
          </div>
        )}

        {chunk.metadata?.chunk_index !== undefined && (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Chunk Index</p>
            <p className="text-sm text-foreground">{chunk.metadata.chunk_index}</p>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Metadata</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {chunk.metadata?.section_header && (
              <div>
                <span className="text-text-muted">Section Header:</span>
                <p className="text-foreground font-medium mt-0.5">{chunk.metadata.section_header}</p>
              </div>
            )}
            {chunk.metadata?.section_level !== undefined && (
              <div>
                <span className="text-text-muted">Level:</span>
                <p className="text-foreground font-medium mt-0.5">{chunk.metadata.section_level}</p>
              </div>
            )}
            {chunk.metadata?.processing_duration_ms && (
              <div>
                <span className="text-text-muted">Processing:</span>
                <p className="text-foreground font-medium mt-0.5">{chunk.metadata.processing_duration_ms}ms</p>
              </div>
            )}
            {chunk.metadata?.page_count && (
              <div>
                <span className="text-text-muted">Pages:</span>
                <p className="text-foreground font-medium mt-0.5">{chunk.metadata.page_count}</p>
              </div>
            )}
            {chunk.metadata?.project_id && (
              <div>
                <span className="text-text-muted">Project:</span>
                <p className="text-foreground font-medium mt-0.5">{chunk.metadata.project_id}</p>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Content</p>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3 text-sm text-foreground whitespace-pre-wrap overflow-x-auto font-mono">
            {chunk.text || "No content available"}
          </div>
        </div>
      </div>
    </div>
  );
}
