import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Trash2, CheckCircle, Clock, AlertTriangle, Loader } from "lucide-react";
import { api } from "@/lib/api";
import { ChunksList } from "@/components/ChunksList";
import { ExtractedContentView } from "@/components/ExtractedContentView";
import { ComparisonResults } from "@/components/ComparisonResults";
import { useState } from "react";

interface DocumentData {
  id: string;
  name: string;
  file_type?: string;
  file_size?: number;
  processing_status: string;
  noesia_chunk_count?: number;
  created_at: string;
}

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

const pipelineStatusConfig = {
  uploaded: { icon: "📤", label: "Uploaded", color: "text-text-secondary", bg: "bg-surface" },
  pending: { icon: "⏳", label: "Pending", color: "text-warning", bg: "bg-warning/5" },
  processing: { icon: "🔄", label: "Processing", color: "text-warning", bg: "bg-warning/5" },
  completed: { icon: "✅", label: "Completed", color: "text-success", bg: "bg-success/5" },
  failed: { icon: "❌", label: "Failed", color: "text-critical", bg: "bg-critical/5" },
};

export default function DocumentDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { documentId } = useParams<{ documentId: string }>();
  const [activeTab, setActiveTab] = useState<"chunks" | "document" | "comparison">("chunks");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: documentData, isLoading: docLoading } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => api.get(`/documents`).then(r => {
      const docs = r.data as DocumentData[];
      return docs.find(d => d.id === documentId);
    }),
  });

  const { data: chunksData, isLoading: chunksLoading } = useQuery({
    queryKey: ["document-chunks", documentId],
    queryFn: () =>
      api
        .get(`/documents/${documentId}/chunks`)
        .then((r) => r.data)
        .catch(() => ({ chunks: [] })),
    enabled: !!documentId && documentData?.processing_status === "completed",
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/documents/${documentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate("/documents");
    },
  });

  const chunks = chunksData?.chunks || [];

  if (!documentId) {
    return <div className="flex-1 p-8">Invalid document ID</div>;
  }

  if (docLoading) {
    return <div className="flex-1 p-8 text-text-secondary">Loading...</div>;
  }

  if (!documentData) {
    return <div className="flex-1 p-8 text-critical">Document not found</div>;
  }

  const isProcessing = documentData.processing_status === "processing" || documentData.processing_status === "pending";
  const statusConfig = pipelineStatusConfig[documentData.processing_status as keyof typeof pipelineStatusConfig] || pipelineStatusConfig.uploaded;

  function formatFileSize(bytes: number | undefined) {
    if (!bytes) return "—";
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-background">
      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-6">
          {/* Back Link */}
          <button
            onClick={() => navigate("/documents")}
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-foreground w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Documents
          </button>

          {/* Document Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-surface rounded-lg">
                <FileText className="h-6 w-6 text-accent-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{documentData.name}</h1>
                <div className="flex items-center gap-2 mt-2">
                  {documentData.file_type && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded bg-surface text-text-secondary">
                      {documentData.file_type}
                    </span>
                  )}
                  <span className={`text-xs font-medium px-2.5 py-1 rounded ${statusConfig.bg} ${statusConfig.color}`}>
                    {statusConfig.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Delete Button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 text-sm text-critical hover:text-critical/80 font-medium px-3 py-2 border border-critical/30 rounded hover:bg-critical/5 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="bg-critical/5 border border-critical/30 rounded-lg p-4">
              <p className="text-sm text-critical font-medium">Are you sure you want to delete this document?</p>
              <p className="text-xs text-critical/70 mt-1">This action cannot be undone.</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="bg-critical text-white text-sm font-medium px-3 py-1.5 rounded hover:bg-critical/90 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? "Deleting..." : "Yes, Delete"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-sm text-text-secondary px-3 py-1.5 rounded border border-border hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-4 gap-4 bg-card border border-border rounded-lg p-6">
            <div>
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Chunks</p>
              <p className="font-semibold text-foreground mt-1">
                {isProcessing ? "Processing..." : documentData.noesia_chunk_count || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">File Size</p>
              <p className="font-semibold text-foreground mt-1">{formatFileSize(documentData.file_size)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Status</p>
              <p className="font-semibold text-foreground mt-1">{documentData.processing_status}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Uploaded</p>
              <p className="font-semibold text-foreground mt-1">{new Date(documentData.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          {/* Processing Notice */}
          {isProcessing && (
            <div className="bg-card border border-border rounded-lg p-4 text-sm text-foreground flex items-start gap-2">
              <Loader className="h-4 w-4 mt-0.5 animate-spin text-warning" />
              <span>Document is being processed. Chunks will appear here once complete. Page auto-refreshes.</span>
            </div>
          )}

          {/* Tabs - Only show when completed */}
          {documentData.processing_status === "completed" && (
            <>
              <div className="flex gap-1 border-b border-border">
                <button
                  onClick={() => setActiveTab("chunks")}
                  className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === "chunks"
                      ? "text-accent-600 border-accent-600"
                      : "text-text-secondary border-transparent hover:text-foreground"
                  }`}
                >
                  Chunks
                </button>
                <button
                  onClick={() => setActiveTab("document")}
                  className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === "document"
                      ? "text-accent-600 border-accent-600"
                      : "text-text-secondary border-transparent hover:text-foreground"
                  }`}
                >
                  Document
                </button>
                <button
                  onClick={() => setActiveTab("comparison")}
                  className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === "comparison"
                      ? "text-accent-600 border-accent-600"
                      : "text-text-secondary border-transparent hover:text-foreground"
                  }`}
                >
                  Compliance Analysis
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === "chunks" && <ChunksList chunks={chunks} isLoading={chunksLoading} />}
                {activeTab === "document" && <ExtractedContentView chunks={chunks} isLoading={chunksLoading} />}
                {activeTab === "comparison" && (
                  <ComparisonResults comparisonId={new URLSearchParams(window.location.search).get("comparison_id")} />
                )}
              </div>
            </>
          )}

          {/* No Content Message */}
          {documentData.processing_status === "failed" && (
            <div className="bg-critical/5 border border-critical/30 rounded-lg p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-critical mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Processing Failed</h3>
              <p className="text-sm text-text-secondary">This document could not be processed. Please try uploading it again.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
