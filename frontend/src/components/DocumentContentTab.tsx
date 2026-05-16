import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { Loader, AlertCircle } from "lucide-react";

interface DocumentContentTabProps {
  documentId: string;
}

export function DocumentContentTab({ documentId }: DocumentContentTabProps) {
  const { data, isLoading, isError, error } = useQuery<{ content: string }>({
    queryKey: ["document-content", documentId],
    queryFn: () => api.get(`/documents/${documentId}/content`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-secondary">
        <Loader className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm">Loading document…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-2 text-critical text-sm bg-critical/5 border border-critical/20 rounded-lg p-4">
        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>
          Could not load document content.{" "}
          {(error as any)?.response?.data?.detail ?? (error as Error)?.message ?? "Unknown error"}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-6 overflow-y-auto scrollbar-thin h-full">
      <div className="prose prose-sm dark:prose-invert max-w-none
        prose-headings:font-bold prose-headings:text-foreground
        prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
        prose-p:text-text-secondary prose-p:leading-relaxed prose-p:my-1
        prose-table:text-xs prose-table:border-collapse
        prose-td:border prose-td:border-border prose-td:p-1.5 prose-td:align-top prose-td:text-text-secondary
        prose-th:border prose-th:border-border prose-th:p-1.5 prose-th:bg-surface prose-th:font-semibold prose-th:text-text-secondary
        prose-a:text-accent-600 prose-strong:text-foreground
        prose-li:text-text-secondary">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {data?.content ?? ""}
        </ReactMarkdown>
      </div>
    </div>
  );
}
