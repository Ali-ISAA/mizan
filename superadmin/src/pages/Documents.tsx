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

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

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

  function formatSize(bytes: number | null) {
    if (!bytes) return "—";
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Base Documents</h2>
          <p className="text-sm text-gray-500 mt-0.5">Compliance reference documents for user comparison</p>
        </div>
        <div className="flex items-center gap-2">
          {docs.length > 0 && (
            <button
              onClick={() => setShowDeleteAll(true)}
              className="flex items-center gap-2 text-red-600 border border-red-200 text-sm font-medium px-4 py-2 rounded-md hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete All
            </button>
          )}
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-slate-800 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload Document
          </button>
        </div>
      </div>

      {/* Delete All confirmation */}
      {showDeleteAll && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800 font-medium">
            Delete {typeFilter || statusFilter ? "filtered" : "all"} {docs.length} document{docs.length !== 1 ? "s" : ""}?
          </p>
          <p className="text-xs text-red-600 mt-1">This cannot be undone. All associated chunks and articles will be removed.</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
              className="bg-red-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {deleteAllMutation.isPending ? "Deleting…" : `Yes, Delete ${docs.length}`}
            </button>
            <button
              onClick={() => setShowDeleteAll(false)}
              className="text-sm text-gray-600 px-3 py-1.5 rounded-md border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Upload form */}
      {showUpload && (
        <div className="bg-white border rounded-lg p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Upload New Base Document</h3>

          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-slate-400 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                <FileText className="h-5 w-5 text-slate-500" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-gray-400">({formatSize(selectedFile.size)})</span>
              </div>
            ) : (
              <div>
                <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600 font-medium">Click to choose a file</p>
                <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX, TXT supported</p>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
            <select
              value={uploadType}
              onChange={e => setUploadType(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value="">Select type...</option>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={!selectedFile || !uploadType || uploadMutation.isPending}
              className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload & Process"}
            </button>
            <button
              onClick={() => { setShowUpload(false); setSelectedFile(null); setUploadType(""); setUploadError(""); }}
              className="text-sm text-gray-600 px-4 py-2 rounded-md border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <option value="">All Types</option>
          {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <option value="">All Statuses</option>
          {["pending", "processing", "completed", "failed"].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Filename", "Type", "Status", "Chunks", "Size", "Uploaded", ""].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {!isLoading && docs.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No documents yet</td></tr>
            )}
            {docs.map(doc => (
              <tr key={doc.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-gray-900 truncate max-w-xs">{doc.filename}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className="bg-slate-100 text-slate-700 text-xs font-medium px-2 py-0.5 rounded">{doc.doc_type}</span>
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[doc.processing_status] ?? "bg-gray-100 text-gray-600"}`}>
                    {doc.processing_status}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-600">{doc.chunk_count || "—"}</td>
                <td className="px-4 py-2 text-gray-500">{formatSize(doc.file_size)}</td>
                <td className="px-4 py-2 text-gray-400 text-xs">{new Date(doc.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2">
                  <Link
                    to={`/documents/${doc.id}`}
                    className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-medium"
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
