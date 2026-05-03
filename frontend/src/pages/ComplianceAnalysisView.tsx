import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, AlertCircle, Loader, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressIndicator } from "@/components/ProgressIndicator";
import { ComplianceAnalysisResults } from "@/pages/ComplianceAnalysisResults";

const POLL_INTERVAL_MS = 5000;

interface DocumentData {
  id: string;
  name: string;
  file_type?: string;
  file_size?: number;
  created_at: string;
}

interface ComparisonStatus {
  status: "pending" | "processing" | "completed" | "failed";
  current_chunk?: number;
  total_chunks?: number;
  started_at?: string;
  completed_at?: string;
  estimated_completion?: string;
  error_message?: string;
}

interface ComplianceReport {
  id: string;
  compliance_score: number;
  total_findings: number;
  critical_count: number;
  medium_count: number;
  low_count: number;
  summary: string;
}

interface ComplianceFinding {
  id: string;
  doc_a_section: string;
  doc_b_section: string;
  status: "compliant" | "gap" | "conflict" | "missing";
  severity: "critical" | "medium" | "low";
  issue: string;
  recommendation: string;
}

interface ReportResponse {
  report: ComplianceReport;
  findings: ComplianceFinding[];
}

export default function ComplianceAnalysisView() {
  const navigate = useNavigate();
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const comparisonId = searchParams.get("comparison_id");

  const { data: documentData, isLoading: docLoading } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () =>
      api.get("/documents").then((r) => {
        const docs = r.data as DocumentData[];
        return docs.find((d) => d.id === documentId);
      }),
    enabled: !!documentId,
  });

  const { data: statusData, isLoading: statusLoading } = useQuery<ComparisonStatus | null>({
    queryKey: ["comparison-status", comparisonId],
    queryFn: () =>
      comparisonId
        ? api
            .get<ComparisonStatus>(`/documents/comparisons/${comparisonId}/status`)
            .then((r) => r.data)
            .catch(() => null)
        : null,
    enabled: !!comparisonId,
    refetchInterval: (query) => {
      const data = query.state.data as ComparisonStatus | null;
      if (data?.status === "completed" || data?.status === "failed") return false;
      return POLL_INTERVAL_MS;
    },
  });

  const comparisonStatus = statusData?.status || "pending";

  const { mutate: reanalyze, isPending: isReanalyzing } = useMutation({
    mutationFn: () =>
      api.post(`/documents/${documentId}/analyze`).then((r) => r.data as { comparison_id: string }),
    onSuccess: (data) => {
      navigate(`/documents/${documentId}/analysis?comparison_id=${data.comparison_id}`);
    },
  });

  const { data: reportData, isLoading: reportLoading } = useQuery<ReportResponse | null>({
    queryKey: ["compliance-report", comparisonId],
    queryFn: () =>
      comparisonId && comparisonStatus === "completed"
        ? api
            .get<ReportResponse>(`/documents/comparisons/${comparisonId}/report`)
            .then((r) => r.data)
            .catch(() => null)
        : null,
    enabled: !!comparisonId && comparisonStatus === "completed",
  });

  if (!documentId) {
    return <div className="flex-1 p-8">Invalid document ID</div>;
  }

  if (!comparisonId) {
    return (
      <div className="flex-1 flex flex-col h-screen bg-background">
        <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-6">
          <button
            onClick={() => navigate("/documents")}
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-foreground w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Documents
          </button>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="h-16 w-16 bg-surface rounded-lg mx-auto flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-text-secondary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">No Analysis Yet</h2>
              <p className="text-sm text-text-secondary max-w-md">
                Start a compliance analysis from the Documents page by clicking "Analyze" on a document.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (docLoading || statusLoading) {
    return (
      <div className="flex-1 p-8 text-center">
        <Loader className="h-8 w-8 animate-spin text-accent-600 mx-auto mb-4" />
        <p className="text-text-secondary">Loading analysis...</p>
      </div>
    );
  }

  if (comparisonStatus === "processing" || comparisonStatus === "pending") {
    return (
      <div className="flex-1 flex flex-col h-screen bg-background">
        <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-6">
          <button
            onClick={() => navigate("/documents")}
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-foreground w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Documents
          </button>
          <div className="max-w-xl mx-auto w-full mt-16">
            <ProgressIndicator
              currentChunk={statusData?.current_chunk ?? 0}
              totalChunks={statusData?.total_chunks ?? 0}
              startedAt={statusData?.started_at ?? new Date().toISOString()}
              estimatedCompletion={statusData?.estimated_completion ?? null}
            />
          </div>
        </div>
      </div>
    );
  }

  if (comparisonStatus === "failed") {
    return (
      <div className="flex-1 flex flex-col h-screen bg-background">
        <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-6">
          <button
            onClick={() => navigate("/documents")}
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-foreground w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Documents
          </button>
          <Card className="border-red-500/50 bg-red-900/10 max-w-xl mx-auto w-full mt-16">
            <CardContent className="pt-8 text-center space-y-4">
              <AlertCircle className="h-8 w-8 text-critical mx-auto" />
              <p className="font-semibold text-critical">Analysis Failed</p>
              <p className="text-xs text-slate-500">
                {statusData?.error_message || "An error occurred while processing the analysis."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => reanalyze()}
                disabled={isReanalyzing}
                className="mx-auto"
              >
                <RotateCcw className={`h-4 w-4 mr-2 ${isReanalyzing ? 'animate-spin' : ''}`} />
                {isReanalyzing ? 'Starting…' : 'Try Again'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (reportLoading || !reportData) {
    return (
      <div className="flex-1 p-8 text-center">
        <Loader className="h-8 w-8 animate-spin text-accent-600 mx-auto mb-4" />
        <p className="text-text-secondary">Loading report...</p>
      </div>
    );
  }

  const { report, findings } = reportData;
  const doc = documentData;

  const analysisData = {
    document: {
      name: doc?.name ?? "Document",
      type: doc?.file_type?.toUpperCase() ?? "Document",
      size: doc?.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : "—",
      uploaded: doc?.created_at ? new Date(doc.created_at).toLocaleDateString() : "—",
    },
    overview: {
      compliance_score: report.compliance_score,
      total_clauses: findings.length,
      issues_found: findings.filter((f) => f.status !== "compliant").length,
      compliant_clauses: findings.filter((f) => f.status === "compliant").length,
      needs_review: findings.filter((f) => f.status === "gap").length,
      critical_issues: report.critical_count,
    },
    clauses: findings.map((f) => ({
      id: f.id,
      name: f.doc_a_section || "Section",
      doc_b_section: f.doc_b_section,
      status: f.status,
      severity: f.severity,
      confidence:
        f.status === "compliant" ? 92 : f.severity === "critical" ? 40 : f.severity === "medium" ? 60 : 75,
      summary: f.issue,
      recommendation: f.recommendation !== "No action required" ? f.recommendation : undefined,
    })),
  };

  return (
    <ComplianceAnalysisResults
      data={analysisData}
      onReanalyze={() => reanalyze()}
      isReanalyzing={isReanalyzing}
    />
  );
}
