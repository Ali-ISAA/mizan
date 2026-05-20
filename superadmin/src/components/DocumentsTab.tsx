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

export function DocumentsTab({ doc }: { doc: BaseDoc }) {
  const { data, isLoading, isError, error } = useQuery<{ content: string }>({
    queryKey: ["base-doc-content", doc.id],
    queryFn: () => api.get(`/superadmin/base-documents/${doc.id}/content`).then(r => r.data),
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
      {/* Doc info bar */}
      <div className="bg-card border border-border rounded-lg p-4 flex-shrink-0 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{doc.filename}</h3>
          <p className="text-sm text-text-muted mt-0.5">File size: {formatSize(doc.file_size)}</p>
        </div>
        <a
          href={doc.file_path ? `/uploads${doc.file_path.startsWith("/") ? doc.file_path : "/" + doc.file_path}` : "#"}
          download
          className="flex items-center gap-2 px-3 py-2 bg-accent-600 hover:bg-accent-700 text-white text-sm rounded-lg transition-colors"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      </div>

      {/* Content */}
      <div className="bg-card border border-border rounded-lg p-6 overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="text-center text-text-muted text-sm py-8">Loading document…</div>
          )}
          {isError && (
            <div className="flex items-start gap-2 text-critical text-sm bg-critical/5 border border-critical/20 rounded-lg p-4">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                Could not load document content.{" "}
                {(error as any)?.response?.data?.detail ?? (error as Error)?.message ?? "Unknown error"}
              </span>
            </div>
          )}
          {data?.content && (
            <div className="prose prose-sm max-w-none
              text-foreground
              prose-headings:font-bold prose-headings:text-foreground
              prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
              prose-p:text-foreground prose-p:leading-relaxed prose-p:my-1
              prose-strong:text-foreground
              prose-table:text-xs prose-table:border-collapse
              prose-td:border prose-td:border-border prose-td:p-1.5 prose-td:align-top prose-td:text-foreground
              prose-th:border prose-th:border-border prose-th:p-1.5 prose-th:bg-surface prose-th:font-semibold prose-th:text-foreground">
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
