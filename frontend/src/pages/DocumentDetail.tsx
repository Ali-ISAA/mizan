import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Trash2, AlertTriangle, Loader } from "lucide-react";
import { api } from "@/lib/api";
import { ChunksList } from "@/components/ChunksList";
import { DocumentContentTab } from "@/components/DocumentContentTab";
import { ComparisonResults } from "@/components/ComparisonResults";
import { useState, useEffect } from "react";

interface DocumentData {
  id: string;
  name: string;
  file_type?: string;
  file_size?: number;
  processing_status: string;
  noesia_chunk_count?: number;
  created_at: string;
  articles_status?: string | null;
  articles_error?: string | null;
}

interface Article {
  id: string;
  article_index: number;
  article_number: string;
  article_text: string;
}

interface ArticlesResponse {
  articles: Article[];
  total: number;
  articles_status: string | null;
  articles_error: string | null;
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
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"chunks" | "document" | "articles" | "comparison">("chunks");
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Initialize activeTab from URL parameter
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "comparison" || tabParam === "document" || tabParam === "chunks" || tabParam === "articles") {
      setActiveTab(tabParam as any);
    }
  }, [searchParams]);

  const { data: documentData, isLoading: docLoading } = useQuery<DocumentData>({
    queryKey: ["document", documentId],
    queryFn: () => api.get(`/documents/${documentId}`).then(r => r.data),
    refetchInterval: (query) => {
      const d = query.state.data;
      const docBusy = d?.processing_status === "processing" || d?.processing_status === "pending";
      const articlesBusy = d?.articles_status === "pending" || d?.articles_status === "processing";
      return docBusy || articlesBusy ? 3000 : false;
    },
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

  const { data: articlesData, isLoading: articlesLoading } = useQuery<ArticlesResponse>({
    queryKey: ["document-articles", documentId, documentData?.articles_status],
    queryFn: () => api.get(`/documents/${documentId}/articles?limit=2000`).then(r => r.data),
    enabled: !!documentId && documentData?.processing_status === "completed",
    refetchInterval: (query) => {
      const status = query.state.data?.articles_status;
      return status === "pending" || status === "processing" ? 3000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/documents/${documentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate("/documents");
    },
  });

  const extractMutation = useMutation({
    mutationFn: () => api.post(`/documents/${documentId}/extract-articles`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["document-articles"] });
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
                {(["chunks", "document", "articles", "comparison"] as const).map((tab) => {
                  const label =
                    tab === "chunks" ? "Chunks" :
                    tab === "document" ? "Document" :
                    tab === "articles" ? "Articles" : "Compliance Analysis";
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
                        activeTab === tab
                          ? "text-accent-600 border-accent-600"
                          : "text-text-secondary border-transparent hover:text-foreground"
                      }`}
                    >
                      {label}
                      {tab === "articles" && documentData.articles_status && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          documentData.articles_status === "completed" ? "bg-green-100 text-green-700" :
                          documentData.articles_status === "failed" ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {documentData.articles_status === "completed" ? (articlesData?.total ?? "—") :
                           documentData.articles_status === "processing" ? "…" :
                           documentData.articles_status === "pending" ? "queued" : documentData.articles_status}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === "chunks" && <ChunksList chunks={chunks} isLoading={chunksLoading} />}
                {activeTab === "document" && <DocumentContentTab documentId={documentId} />}
                {activeTab === "articles" && (
                  <div className="space-y-4 overflow-y-auto h-full">
                    {/* Status + Re-extract */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">Extraction status:</span>
                        {!documentData.articles_status && (
                          <span className="text-xs bg-surface text-text-secondary px-2 py-0.5 rounded-full">Never extracted</span>
                        )}
                        {documentData.articles_status === "pending" && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Queued</span>
                        )}
                        {documentData.articles_status === "processing" && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full animate-pulse">Extracting…</span>
                        )}
                        {documentData.articles_status === "completed" && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            Completed — {articlesData?.total ?? 0} articles
                          </span>
                        )}
                        {documentData.articles_status === "failed" && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Failed</span>
                        )}
                      </div>
                      <button
                        onClick={() => extractMutation.mutate()}
                        disabled={
                          extractMutation.isPending ||
                          documentData.articles_status === "pending" ||
                          documentData.articles_status === "processing"
                        }
                        className="text-sm font-medium px-3 py-1.5 border border-border rounded-md hover:bg-surface disabled:opacity-50 transition-colors"
                      >
                        {extractMutation.isPending ? "Queuing…" : "Re-extract Articles"}
                      </button>
                    </div>

                    {documentData.articles_status === "failed" && documentData.articles_error && (
                      <div className="bg-critical/5 border border-critical/20 rounded-md p-3 text-xs text-critical">
                        {documentData.articles_error}
                      </div>
                    )}

                    {(documentData.articles_status === "pending" || documentData.articles_status === "processing") && (
                      <div className="bg-surface border border-border rounded-lg p-4 text-sm text-foreground flex items-center gap-2">
                        <Loader className="h-4 w-4 animate-spin text-accent-600" />
                        Extracting articles from document. Auto-refreshes every 3 seconds.
                      </div>
                    )}

                    {documentData.articles_status === "completed" && (
                      articlesLoading ? (
                        <div className="text-sm text-text-secondary">Loading articles…</div>
                      ) : !articlesData?.articles.length ? (
                        <div className="text-center py-8 text-sm text-text-secondary">
                          No articles extracted. Click Re-extract Articles to try again.
                        </div>
                      ) : (
                        <div className="border border-border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-surface">
                              <tr>
                                <th className="text-left text-xs font-medium text-text-secondary uppercase px-4 py-2 w-32">Article #</th>
                                <th className="text-left text-xs font-medium text-text-secondary uppercase px-4 py-2">Text</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {articlesData.articles.map((article) => {
                                const isLong = article.article_text.length > 400;
                                const isExpanded = expandedArticles.has(article.id);
                                return (
                                  <tr key={article.id} className="hover:bg-surface/50">
                                    <td className="px-4 py-2 text-xs font-semibold text-foreground align-top whitespace-nowrap">
                                      {article.article_number}
                                    </td>
                                    <td className="px-4 py-2 text-text-secondary align-top">
                                      {isExpanded || !isLong ? article.article_text : article.article_text.slice(0, 400) + "…"}
                                      {isLong && (
                                        <button
                                          onClick={() => setExpandedArticles(prev => {
                                            const next = new Set(prev);
                                            isExpanded ? next.delete(article.id) : next.add(article.id);
                                            return next;
                                          })}
                                          className="ml-2 text-xs text-accent-600 hover:underline"
                                        >
                                          {isExpanded ? "Show less" : "Show more"}
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}

                    {!documentData.articles_status && (
                      <div className="text-center py-8 text-sm text-text-secondary">
                        No articles extracted yet. Click Re-extract Articles to begin.
                      </div>
                    )}
                  </div>
                )}
                {activeTab === "comparison" && (
                  <ComparisonResults comparisonId={searchParams.get("comparison_id")} />
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
