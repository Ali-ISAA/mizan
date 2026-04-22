import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { ChunksList } from "@/components/ChunksList";
import { ExtractedContentView } from "@/components/ExtractedContentView";
import { useState } from "react";

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

export default function DocumentDetail() {
  const navigate = useNavigate();
  const { documentId } = useParams<{ documentId: string }>();
  const [activeTab, setActiveTab] = useState<"chunks" | "document">("chunks");

  const { data: chunksData, isLoading } = useQuery({
    queryKey: ["document-chunks", documentId],
    queryFn: () =>
      api
        .get(`/documents/${documentId}/chunks`)
        .then((r) => r.data)
        .catch(() => ({ chunks: [] })),
    enabled: !!documentId,
  });

  const chunks = chunksData?.chunks || [];

  if (!documentId) {
    return <div className="flex-1 p-8">Invalid document ID</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/documents")}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Document Analysis</h1>
            <p className="text-sm text-text-secondary mt-1">
              View extracted chunks and content analysis
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-border bg-card px-6 pt-4">
          <button
            onClick={() => setActiveTab("chunks")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "chunks"
                ? "text-accent-600 border-accent-600"
                : "text-text-secondary border-transparent hover:text-foreground"
            }`}
          >
            <FileText className="inline h-4 w-4 mr-2" />
            Chunks
          </button>
          <button
            onClick={() => setActiveTab("document")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "document"
                ? "text-accent-600 border-accent-600"
                : "text-text-secondary border-transparent hover:text-foreground"
            }`}
          >
            <FileText className="inline h-4 w-4 mr-2" />
            Document
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "chunks" && (
            <ChunksList chunks={chunks} isLoading={isLoading} />
          )}
          {activeTab === "document" && (
            <ExtractedContentView chunks={chunks} isLoading={isLoading} />
          )}
        </div>
      </div>
    </div>
  );
}
