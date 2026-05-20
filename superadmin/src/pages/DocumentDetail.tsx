import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, Trash2, FileText } from "lucide-react";
import { ChunksTab } from "../components/ChunksTab";
import { DocumentsTab } from "../components/DocumentsTab";

interface BaseDoc {
  id: string; filename: string; doc_type: string; processing_status: string;
  chunk_count: number; file_size: number | null; file_path?: string;
  uploaded_by: string; created_at: string;
  articles_status: string | null; articles_error: string | null;
}
interface Chunk {
  id?: string; text?: string;
  metadata?: { section_header?: string; section_level?: number; chunk_index?: number; source?: string; document_name?: string; processing_duration_ms?: number; page_count?: number; project_id?: string; [key: string]: any };
  [key: string]: any;
}
interface ChunksResponse { chunks: Chunk[]; total: number; }
interface Article { id: string; article_index: number; article_number: string; article_text: string; }
interface ArticlesResponse { articles: Article[]; total: number; articles_status: string | null; articles_error: string | null; }

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"  ? "badge-compliant" :
    status === "processing" ? "badge-info" :
    status === "pending"    ? "badge-warning" :
    "badge-critical";
  return <span className={cls}>{status}</span>;
}

function ArticleTextCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 400;
  return (
    <div>
      <span>{expanded || !isLong ? text : text.slice(0, 400) + "…"}</span>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-2 text-xs text-accent-600 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"chunks" | "documents" | "articles">("chunks");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: doc, isLoading: docLoading } = useQuery<BaseDoc>({
    queryKey: ["base-doc", id],
    queryFn: () => api.get(`/superadmin/base-documents/${id}`).then(r => r.data),
    refetchInterval: (query) => {
      const d = query.state.data;
      return (d?.processing_status === "processing" || d?.processing_status === "pending" ||
              d?.articles_status === "pending" || d?.articles_status === "processing") ? 3000 : false;
    },
  });

  const { data: chunksData, isLoading: chunksLoading } = useQuery<ChunksResponse>({
    queryKey: ["base-doc-chunks", id],
    queryFn: () => api.get(`/superadmin/base-documents/${id}/chunks`).then(r => r.data),
    enabled: doc?.processing_status === "completed",
  });

  const { data: articlesData, isLoading: articlesLoading } = useQuery<ArticlesResponse>({
    queryKey: ["base-doc-articles", id, doc?.articles_status],
    queryFn: () => api.get(`/superadmin/base-documents/${id}/articles?limit=2000`).then(r => r.data),
    enabled: doc?.processing_status === "completed",
    refetchInterval: (query) => {
      const s = query.state.data?.articles_status;
      return s === "pending" || s === "processing" ? 3000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/superadmin/base-documents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["base-docs"] }); navigate("/documents"); },
  });

  const extractMutation = useMutation({
    mutationFn: () => api.post(`/superadmin/base-documents/${id}/extract-articles`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["base-doc", id] });
      qc.invalidateQueries({ queryKey: ["base-doc-articles"] });
    },
  });

  if (docLoading) return <div className="p-6 text-sm text-text-muted">Loading...</div>;
  if (!doc)      return <div className="p-6 text-sm text-critical">Document not found.</div>;

  const isProcessing = doc.processing_status === "processing" || doc.processing_status === "pending";
  const tabs = ["chunks", "documents", "articles"] as const;

  return (
    <div className="p-6 space-y-6">
      {/* Back + Header */}
      <div>
        <Link to="/documents" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Documents
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-surface border border-border rounded-lg mt-0.5">
              <FileText className="h-5 w-5 text-accent-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{doc.filename}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="badge-neutral">{doc.doc_type}</span>
                <StatusBadge status={doc.processing_status} />
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 text-sm text-critical font-medium px-3 py-1.5 border border-critical/30 rounded-lg hover:bg-critical/5 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="bg-critical/5 border border-critical/20 rounded-lg p-4">
          <p className="text-sm text-critical font-medium">Are you sure you want to delete this document?</p>
          <p className="text-xs text-critical/70 mt-1">This action cannot be undone.</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-critical hover:bg-critical/90 text-white text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
            >
              {deleteMutation.isPending ? "Deleting..." : "Yes, Delete"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="text-sm text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Meta info */}
      <div className="bg-card border border-border rounded-lg p-5 grid grid-cols-4 gap-4">
        {[
          { label: "Chunks",      value: doc.chunk_count || (isProcessing ? "Processing…" : "—") },
          { label: "File Size",   value: formatSize(doc.file_size) },
          { label: "Uploaded by", value: doc.uploaded_by },
          { label: "Created",     value: new Date(doc.created_at).toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
            <p className="font-medium text-foreground mt-1">{String(value)}</p>
          </div>
        ))}
      </div>

      {/* Processing notice */}
      {isProcessing && (
        <div className="bg-accent-600/10 border border-accent-600/20 rounded-lg p-4 text-sm text-accent-600">
          Document is being processed through Noesia. Chunks will appear once complete. Page auto-refreshes.
        </div>
      )}

      {/* Tabs */}
      {doc.processing_status === "completed" && (
        <>
          <div className="flex gap-1 border-b border-border">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors capitalize
                  ${activeTab === tab
                    ? "text-accent-600 border-b-2 border-accent-600 -mb-px"
                    : "text-text-muted hover:text-foreground"
                  }`}
              >
                {tab}
                {tab === "articles" && doc.articles_status && (
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium
                    ${doc.articles_status === "completed" ? "badge-compliant" :
                      doc.articles_status === "failed"    ? "badge-critical" :
                      "badge-warning"}`}>
                    {doc.articles_status === "completed" ? (articlesData?.total ?? "—") :
                     doc.articles_status === "processing" ? "…" :
                     doc.articles_status === "pending"    ? "queued" : doc.articles_status}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab === "chunks"    && <ChunksTab chunks={chunksData?.chunks} isLoading={chunksLoading} />}
          {activeTab === "documents" && <DocumentsTab doc={doc} />}

          {activeTab === "articles" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-secondary">Extraction status:</span>
                  {!doc.articles_status && <span className="badge-neutral">Never extracted</span>}
                  {doc.articles_status === "pending"    && <span className="badge-warning">Queued</span>}
                  {doc.articles_status === "processing" && <span className="badge-info animate-pulse">Extracting…</span>}
                  {doc.articles_status === "completed"  && (
                    <span className="badge-compliant">Completed — {articlesData?.total ?? 0} articles</span>
                  )}
                  {doc.articles_status === "failed"     && <span className="badge-critical">Failed</span>}
                </div>
                <button
                  onClick={() => extractMutation.mutate()}
                  disabled={extractMutation.isPending || doc.articles_status === "pending" || doc.articles_status === "processing"}
                  className="text-sm font-medium px-3 py-1.5 border border-border rounded-lg hover:bg-surface disabled:opacity-50 transition-colors text-foreground"
                >
                  {extractMutation.isPending ? "Queuing…" : "Re-extract Articles"}
                </button>
              </div>

              {doc.articles_status === "failed" && doc.articles_error && (
                <div className="bg-critical/5 border border-critical/20 rounded-lg p-3 text-xs text-critical">
                  {doc.articles_error}
                </div>
              )}

              {(doc.articles_status === "pending" || doc.articles_status === "processing") && (
                <div className="bg-accent-600/10 border border-accent-600/20 rounded-lg p-4 text-sm text-accent-600">
                  Extracting articles from chunks using AI. Page auto-refreshes every 3 seconds.
                </div>
              )}

              {doc.articles_status === "completed" && (
                articlesLoading ? (
                  <div className="text-sm text-text-muted">Loading articles...</div>
                ) : !articlesData?.articles.length ? (
                  <div className="text-center py-8 text-sm text-text-muted">
                    No articles extracted yet. Click Re-extract Articles to begin.
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <table className="table-modern">
                      <thead>
                        <tr>
                          <th className="w-28">Article #</th>
                          <th>Text</th>
                        </tr>
                      </thead>
                      <tbody>
                        {articlesData.articles.map(article => (
                          <tr key={article.id}>
                            <td className="font-semibold text-accent-600 align-top whitespace-nowrap w-28">
                              {article.article_number}
                            </td>
                            <td className="align-top text-foreground">
                              <ArticleTextCell text={article.article_text} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {!doc.articles_status && (
                <div className="text-center py-8 text-sm text-text-muted">
                  No articles extracted yet. Click Re-extract Articles to begin.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
