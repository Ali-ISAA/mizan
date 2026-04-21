import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChunksList } from "./ChunksList";
import { ExtractedContentView } from "./ExtractedContentView";

interface Chunk {
  id?: string;
  text?: string;
  metadata?: {
    section_header?: string;
    section_level?: number;
    chunk_index?: number;
    document_name?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface ChunksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentName: string;
}

export function ChunksModal({
  open,
  onOpenChange,
  documentId,
  documentName,
}: ChunksModalProps) {
  const [activeTab, setActiveTab] = useState<"chunks" | "document">("chunks");

  const { data: chunksData, isLoading } = useQuery({
    queryKey: ["document-chunks", documentId],
    queryFn: () =>
      api
        .get(`/documents/${documentId}/chunks`)
        .then((r) => r.data)
        .catch(() => ({ chunks: [] })),
    enabled: open,
  });

  const chunks = chunksData?.chunks || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Document Chunks - {documentName}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
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
            onClick={() => setActiveTab("document")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "document"
                ? "text-slate-900 border-b-2 border-slate-900 -mb-px"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Document
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "chunks" && (
            <ChunksList chunks={chunks} isLoading={isLoading} />
          )}
          {activeTab === "document" && (
            <ExtractedContentView chunks={chunks} isLoading={isLoading} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
