import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, Trash2, FileText } from "lucide-react";
import { ChunksTab } from "../components/ChunksTab";
import { DocumentsTab } from "../components/DocumentsTab";

interface BaseDoc {
  id: string;
  filename: string;
  doc_type: string;
  processing_status: string;
  chunk_count: number;
  file_size: number | null;
  file_path?: string;
  uploaded_by: string;
  created_at: string;
}

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

interface ChunksResponse {
  chunks: Chunk[];
  total: number;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"chunks" | "documents">("chunks");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: doc, isLoading: docLoading } = useQuery<BaseDoc>({
    queryKey: ["base-doc", id],
    queryFn: () => api.get(`/superadmin/base-documents/${id}`).then(r => r.data),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.processing_status === "processing" || data?.processing_status === "pending" ? 3000 : false;
    },
  });

  const { data: chunksData, isLoading: chunksLoading } = useQuery<ChunksResponse>({
    queryKey: ["base-doc-chunks", id],
    queryFn: () => {
      return api.get(`/superadmin/base-documents/${id}/chunks`).then(r => r.data);
    },
    enabled: doc?.processing_status === "completed",
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/superadmin/base-documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["base-docs"] });
      navigate("/documents");
    },
  });

  function formatSize(bytes: number | null) {
    if (!bytes) return "—";
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  if (docLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  }
  if (!doc) {
    return <div className="p-6 text-sm text-red-600">Document not found.</div>;
  }

  const isProcessing = doc.processing_status === "processing" || doc.processing_status === "pending";

  return (
    <div className="p-6 space-y-6">
      {/* Back + Header */}
      <div>
        <Link to="/documents" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Documents
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-slate-100 rounded-lg mt-0.5">
              <FileText className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{doc.filename}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-slate-100 text-slate-700 text-xs font-medium px-2 py-0.5 rounded">{doc.doc_type}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[doc.processing_status] ?? "bg-gray-100"}`}>
                  {doc.processing_status}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium px-3 py-1.5 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800 font-medium">Are you sure you want to delete this document?</p>
          <p className="text-xs text-red-600 mt-1">This action cannot be undone.</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-red-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMutation.isPending ? "Deleting..." : "Yes, Delete"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="text-sm text-gray-600 px-3 py-1.5 rounded-md border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Meta info */}
      <div className="bg-white border rounded-lg p-4 grid grid-cols-4 gap-4 text-sm">
        {[
          { label: "Chunks", value: doc.chunk_count || (isProcessing ? "Processing..." : "—") },
          { label: "File Size", value: formatSize(doc.file_size) },
          { label: "Uploaded by", value: doc.uploaded_by },
          { label: "Created", value: new Date(doc.created_at).toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-gray-500 uppercase font-medium">{label}</p>
            <p className="font-medium text-gray-900 mt-0.5">{String(value)}</p>
          </div>
        ))}
      </div>

      {/* Processing notice */}
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          Document is being processed through Noesia. Chunks will appear here once complete. Page auto-refreshes.
        </div>
      )}

      {/* Tabs */}
      {doc.processing_status === "completed" && (
        <>
          {/* Tab buttons */}
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
              onClick={() => setActiveTab("documents")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "documents"
                  ? "text-slate-900 border-b-2 border-slate-900 -mb-px"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Documents
            </button>
          </div>

          {/* Tab content */}
          {activeTab === "chunks" && (
            <ChunksTab chunks={chunksData?.chunks} isLoading={chunksLoading} />
          )}

          {activeTab === "documents" && (
            <DocumentsTab doc={doc} chunks={chunksData?.chunks} isLoading={chunksLoading} />
          )}
        </>
      )}
    </div>
  );
}
