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
