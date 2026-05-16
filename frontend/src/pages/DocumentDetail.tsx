import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Trash2, AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { ChunksList } from "@/components/ChunksList";
import { DocumentContentTab } from "@/components/DocumentContentTab";
import { ComparisonResults } from "@/components/ComparisonResults";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  uploaded:   { label: "Uploaded",   color: "text-text-secondary", bg: "bg-surface border border-border" },
  pending:    { label: "Pending",    color: "text-warning",        bg: "bg-warning/10 border border-warning/20" },
  processing: { label: "Processing", color: "text-warning",        bg: "bg-warning/10 border border-warning/20" },
  completed:  { label: "Completed",  color: "text-success",        bg: "bg-success/10 border border-success/20" },
  failed:     { label: "Failed",     color: "text-critical",       bg: "bg-critical/10 border border-critical/20" },
};

function formatFileSize(bytes: number | undefined) {
  if (!bytes) return "—";
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"chunks" | "document" | "articles" | "comparison">("chunks");
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    queryFn: () => api.get(`/documents/${documentId}/chunks`).then(r => r.data).catch(() => ({ chunks: [] })),
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

  if (!documentId) return <div className="flex-1 p-8">Invalid document ID</div>;

  if (docLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-accent-600" />
      </div>
    );
  }

  if (!documentData) {
    return <div className="flex-1 p-8 text-critical">Document not found</div>;
  }

  const isProcessing = documentData.processing_status === "processing" || documentData.processing_status === "pending";
  const statusCfg = pipelineStatusConfig[documentData.processing_status as keyof typeof pipelineStatusConfig] ?? pipelineStatusConfig.uploaded;

  const tabs = [
    { id: "chunks",     label: "Chunks" },
    { id: "document",   label: "Document" },
    { id: "articles",   label: "Articles" },
    { id: "comparison", label: "Compliance Analysis" },
  ] as const;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      <div className="flex-1 flex flex-col overflow-hidden p-8 space-y-6 animate-fade-in">

        {/* Back Link */}
        <button
          onClick={() => navigate("/documents")}
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Documents
        </button>

        {/* Document Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-600/10 border border-accent-600/20 flex-shrink-0">
              <FileText className="h-6 w-6 text-accent-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{documentData.name}</h1>
              <div className="flex items-center gap-2 mt-2">
                {documentData.file_type && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-surface border border-border text-text-secondary uppercase tracking-wider">
                    {documentData.file_type}
                  </span>
                )}
                <span className={`text-xs font-medium px-2.5 py-1 rounded-md ${statusCfg.bg} ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-critical border-critical/30 hover:bg-critical/5 hover:border-critical/50"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="card-elevated p-4 border-critical/30 bg-critical/5">
            <p className="text-sm font-medium text-critical">Are you sure you want to delete this document?</p>
            <p className="text-xs text-critical/70 mt-1">This action cannot be undone.</p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="bg-critical hover:bg-critical/90 text-white"
              >
                {deleteMutation.isPending ? "Deleting…" : "Yes, Delete"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Metadata Grid */}
        <div className="card-elevated p-0 overflow-hidden">
          <div className="grid grid-cols-4 divide-x divide-border">
            {[
              { label: "Chunks",   value: isProcessing ? "…" : String(documentData.noesia_chunk_count || "—") },
              { label: "File Size", value: formatFileSize(documentData.file_size) },
              { label: "Status",   value: statusCfg.label },
              { label: "Uploaded", value: new Date(documentData.created_at).toLocaleDateString() },
            ].map((item) => (
              <div key={item.label} className="px-6 py-5">
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">{item.label}</p>
                <p className="text-lg font-semibold text-foreground mt-1">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Processing Notice */}
        {isProcessing && (
          <div className="card-elevated p-4 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-warning flex-shrink-0" />
            <span className="text-sm text-text-secondary">Document is being processed. This page refreshes automatically.</span>
          </div>
        )}

        {/* Failed State */}
        {documentData.processing_status === "failed" && (
          <div className="card-elevated border-critical/30 bg-critical/5 p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-critical mx-auto mb-4 opacity-60" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Processing Failed</h3>
            <p className="text-sm text-text-secondary">This document could not be processed. Please try uploading it again.</p>
          </div>
        )}

        {/* Tabs + Content */}
        {documentData.processing_status === "completed" && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">

            {/* Tab Bar */}
            <div className="flex gap-1 border-b border-border flex-shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
                    activeTab === tab.id
                      ? "text-accent-600 border-accent-600"
                      : "text-text-secondary border-transparent hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {tab.id === "articles" && documentData.articles_status && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      documentData.articles_status === "completed" ? "bg-success/15 text-success" :
                      documentData.articles_status === "failed"    ? "bg-critical/15 text-critical" :
                      "bg-warning/15 text-warning"
                    }`}>
                      {documentData.articles_status === "completed"
                        ? (articlesData?.total ?? "—")
                        : documentData.articles_status === "processing" ? "…"
                        : documentData.articles_status === "pending"    ? "queued"
                        : documentData.articles_status}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden pt-4">

              {activeTab === "chunks" && <ChunksList chunks={chunks} isLoading={chunksLoading} />}

              {activeTab === "document" && <DocumentContentTab documentId={documentId} />}

              {activeTab === "articles" && (
                <div className="space-y-4 overflow-y-auto scrollbar-thin h-full">
                  {/* Status row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">Extraction status:</span>
                      {!documentData.articles_status && (
                        <Badge variant="outline" className="text-text-secondary">Never extracted</Badge>
                      )}
                      {documentData.articles_status === "pending" && (
                        <Badge className="bg-warning/15 text-warning border-warning/20">Queued</Badge>
                      )}
                      {documentData.articles_status === "processing" && (
                        <Badge className="bg-accent-600/15 text-accent-600 border-accent-600/20 animate-pulse">Extracting…</Badge>
                      )}
                      {documentData.articles_status === "completed" && (
                        <Badge className="bg-success/15 text-success border-success/20">
                          Completed — {articlesData?.total ?? 0} articles
                        </Badge>
                      )}
                      {documentData.articles_status === "failed" && (
                        <Badge className="bg-critical/15 text-critical border-critical/20">Failed</Badge>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => extractMutation.mutate()}
                      disabled={
                        extractMutation.isPending ||
                        documentData.articles_status === "pending" ||
                        documentData.articles_status === "processing"
                      }
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      {extractMutation.isPending ? "Queuing…" : "Re-extract Articles"}
                    </Button>
                  </div>

                  {documentData.articles_status === "failed" && documentData.articles_error && (
                    <div className="card-elevated border-critical/20 bg-critical/5 p-3 text-xs text-critical">
                      {documentData.articles_error}
                    </div>
                  )}

                  {(documentData.articles_status === "pending" || documentData.articles_status === "processing") && (
                    <div className="card-elevated p-4 flex items-center gap-3">
                      <Loader2 className="h-4 w-4 animate-spin text-accent-600 flex-shrink-0" />
                      <span className="text-sm text-text-secondary">Extracting articles… Auto-refreshes every 3 seconds.</span>
                    </div>
                  )}

                  {documentData.articles_status === "completed" && (
                    articlesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-accent-600" />
                      </div>
                    ) : !articlesData?.articles.length ? (
                      <div className="card-elevated p-8 text-center text-sm text-text-secondary">
                        No articles extracted. Click Re-extract Articles to try again.
                      </div>
                    ) : (
                      <div className="card-elevated overflow-auto scrollbar-thin">
                        <table className="w-full text-sm">
                          <thead className="bg-surface border-b border-border sticky top-0">
                            <tr>
                              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider px-5 py-3 w-36">Article #</th>
                              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">Text</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {articlesData.articles.map((article) => {
                              const isLong = article.article_text.length > 400;
                              const isExpanded = expandedArticles.has(article.id);
                              return (
                                <tr key={article.id} className="hover:bg-surface/60 transition-colors">
                                  <td className="px-5 py-3 text-xs font-semibold text-foreground align-top whitespace-nowrap">
                                    {article.article_number}
                                  </td>
                                  <td className="px-5 py-3 text-sm text-text-secondary align-top leading-relaxed">
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
                    <div className="card-elevated p-8 text-center text-sm text-text-secondary">
                      No articles extracted yet. Click Re-extract Articles to begin.
                    </div>
                  )}
                </div>
              )}

              {activeTab === "comparison" && (
                <ComparisonResults comparisonId={searchParams.get("comparison_id")} />
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
