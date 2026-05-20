import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Upload, FileText, Eye, Trash2 } from "lucide-react";

interface BaseDoc {
  id: string; filename: string; doc_type: string;
  processing_status: string; chunk_count: number;
  file_size: number | null; created_at: string;
}

const DOC_TYPES = ["GDPR", "SOX", "HIPAA", "ISO 27001", "CCPA", "PCI DSS", "Others"];

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"  ? "badge-compliant" :
    status === "processing" ? "badge-info" :
    status === "pending"    ? "badge-warning" :
    "badge-critical";
  return <span className={cls}>{status}</span>;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const inputCls = "w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-transparent transition-all";
const selectCls = "bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-transparent transition-all";

export default function Documents() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [uploadType, setUploadType] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");

  const { data: docs = [], isLoading } = useQuery<BaseDoc[]>({
    queryKey: ["base-docs", typeFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (typeFilter) params.set("doc_type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      return api.get(`/superadmin/base-documents?${params}`).then(r => r.data);
    },
    refetchInterval: 5000,
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams();
      if (typeFilter) params.set("doc_type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      return api.delete(`/superadmin/base-documents?${params}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["base-docs"] });
      qc.invalidateQueries({ queryKey: ["sa-base-doc-stats"] });
      setShowDeleteAll(false);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !uploadType) throw new Error("Missing file or type");
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("doc_type", uploadType);
      return api.post("/superadmin/base-documents", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["base-docs"] });
      qc.invalidateQueries({ queryKey: ["sa-base-doc-stats"] });
      setShowUpload(false);
      setSelectedFile(null);
      setUploadType("");
      setUploadError("");
    },
    onError: (e: any) => {
      setUploadError(e.response?.data?.detail || "Upload failed");
    },
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Base Documents</h2>
          <p className="text-sm text-text-muted mt-0.5">Compliance reference documents for user comparison</p>
        </div>
        <div className="flex items-center gap-2">
          {docs.length > 0 && (
            <button
              onClick={() => setShowDeleteAll(true)}
              className="flex items-center gap-2 text-critical border border-critical/30 text-sm font-medium px-4 py-2 rounded-lg hover:bg-critical/5 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete All
            </button>
          )}
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Upload className="h-4 w-4" />
            Upload Document
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteAll && (
        <div className="bg-critical/5 border border-critical/20 rounded-lg p-4">
          <p className="text-sm text-critical font-medium">
            Delete {typeFilter || statusFilter ? "filtered" : "all"} {docs.length} document{docs.length !== 1 ? "s" : ""}?
          </p>
          <p className="text-xs text-critical/80 mt-1">This cannot be undone. All chunks and articles will be removed.</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
              className="bg-critical hover:bg-critical/90 text-white text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
            >
              {deleteAllMutation.isPending ? "Deleting…" : `Yes, Delete ${docs.length}`}
            </button>
            <button
              onClick={() => setShowDeleteAll(false)}
              className="text-sm text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Upload form */}
      {showUpload && (
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Upload New Base Document</h3>

          <div
            className="border-2 border-dashed border-border hover:border-accent-600 rounded-lg p-8 text-center cursor-pointer transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                <FileText className="h-5 w-5 text-accent-600 flex-shrink-0" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-text-muted">({formatSize(selectedFile.size)})</span>
              </div>
            ) : (
              <div>
                <Upload className="h-8 w-8 mx-auto text-text-muted mb-2" />
                <p className="text-sm text-foreground font-medium">Click to choose a file</p>
                <p className="text-xs text-text-muted mt-1">PDF, DOC, DOCX, TXT supported</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt"
              onChange={e => setSelectedFile(e.target.files?.[0] || null)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Document Type</label>
            <select
              value={uploadType}
              onChange={e => setUploadType(e.target.value)}
              className={selectCls}
              style={{ width: "100%" }}
            >
              <option value="">Select type...</option>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {uploadError && <p className="text-sm text-critical">{uploadError}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={!selectedFile || !uploadType || uploadMutation.isPending}
              className="bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload & Process"}
            </button>
            <button
              onClick={() => { setShowUpload(false); setSelectedFile(null); setUploadType(""); setUploadError(""); }}
              className="text-sm text-foreground px-4 py-2 rounded-lg border border-border hover:bg-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={selectCls}>
          <option value="">All Types</option>
          {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">All Statuses</option>
          {["pending", "processing", "completed", "failed"].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
        <table className="table-modern">
          <thead>
            <tr>
              {["Filename", "Type", "Status", "Chunks", "Size", "Uploaded", ""].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="text-center text-text-muted py-8">Loading...</td></tr>
            )}
            {!isLoading && docs.length === 0 && (
              <tr><td colSpan={7} className="text-center text-text-muted py-8">No documents yet</td></tr>
            )}
            {docs.map(doc => (
              <tr key={doc.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-text-muted flex-shrink-0" />
                    <span className="font-medium text-foreground truncate max-w-xs">{doc.filename}</span>
                  </div>
                </td>
                <td>
                  <span className="badge-neutral">{doc.doc_type}</span>
                </td>
                <td><StatusBadge status={doc.processing_status} /></td>
                <td className="text-text-secondary">{doc.chunk_count || "—"}</td>
                <td className="text-text-muted">{formatSize(doc.file_size)}</td>
                <td className="text-text-muted text-xs">{new Date(doc.created_at).toLocaleDateString()}</td>
                <td>
                  <Link
                    to={`/documents/${doc.id}`}
                    className="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-medium transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
