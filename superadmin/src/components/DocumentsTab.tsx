import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../lib/api";
import { Download, AlertCircle } from "lucide-react";

interface BaseDoc {
  id: string;
  filename: string;
  file_path?: string;
  file_size?: number | null;
  [key: string]: any;
}

interface DocumentsTabProps {
  doc: BaseDoc;
}

export function DocumentsTab({ doc }: DocumentsTabProps) {
  const { data, isLoading, isError, error } = useQuery<{ content: string }>({
    queryKey: ["base-doc-content", doc.id],
    queryFn: () =>
      api.get(`/superadmin/base-documents/${doc.id}/content`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  function formatSize(bytes: number | null | undefined) {
    if (!bytes) return "—";
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-300px)] min-h-96 gap-4">
      {/* Document Info */}
      <div className="bg-white border rounded-lg p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{doc.filename}</h3>
            <p className="text-sm text-gray-500 mt-1">
              File size: {formatSize(doc.file_size)}
            </p>
          </div>
          <a
            href={
              doc.file_path
                ? `/uploads${doc.file_path.startsWith("/") ? doc.file_path : "/" + doc.file_path}`
                : "#"
            }
            download
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      </div>

      {/* Content Area */}
      <div className="bg-white border rounded-lg p-6 overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="text-center text-gray-400 text-sm py-8">
              Loading document…
            </div>
          )}

          {isError && (
            <div className="flex items-start gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-md p-4">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                Could not load document content.{" "}
                {(error as any)?.response?.data?.detail ??
                  (error as Error)?.message ??
                  "Unknown error"}
              </span>
            </div>
          )}

          {data?.content && (
            <div className="prose prose-sm max-w-none text-gray-800
              prose-headings:font-bold prose-headings:text-slate-900
              prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
              prose-table:text-xs prose-table:border-collapse
              prose-td:border prose-td:border-gray-300 prose-td:p-1.5 prose-td:align-top
              prose-th:border prose-th:border-gray-300 prose-th:p-1.5 prose-th:bg-gray-50 prose-th:font-semibold
              prose-p:leading-relaxed prose-p:my-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
