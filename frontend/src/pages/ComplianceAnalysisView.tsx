import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, MessageSquare, Loader, Loader2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DocumentData {
  id: string;
  name: string;
  file_type?: string;
  file_size?: number;
  processing_status: string;
  created_at: string;
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

const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds while processing

interface ComparisonStatus {
  status: "pending" | "processing" | "completed" | "failed";
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

export default function ComplianceAnalysisView() {
  const navigate = useNavigate();
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const comparisonId = searchParams.get("comparison_id");

  // Fetch document info
  const { data: documentData, isLoading: docLoading } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () =>
      api.get("/documents").then((r) => {
        const docs = r.data as DocumentData[];
        return docs.find((d) => d.id === documentId);
      }),
    enabled: !!documentId,
  });

  // Poll for comparison status
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
      // Stop polling when completed or failed
      if (data?.status === "completed" || data?.status === "failed") {
        return false;
      }
      return POLL_INTERVAL_MS;
    },
  });

  // Fetch comparison report once status is completed
  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["compliance-report", comparisonId],
    queryFn: () =>
      comparisonId && statusData?.status === "completed"
        ? api.get<ReportResponse>(`/documents/comparisons/${comparisonId}/report`).then((r) => r.data)
        : null,
    enabled: !!comparisonId && statusData?.status === "completed",
  });

  const comparisonStatus = (statusData?.status || "pending") as "pending" | "processing" | "completed" | "failed";

  if (!documentId) {
    return <div className="flex-1 p-8">Invalid document ID</div>;
  }

  // Show "No Analysis Yet" if no comparison_id
  if (!comparisonId) {
    return (
      <div className="flex-1 flex flex-col h-screen bg-background">
        <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-6">
          {/* Back Link */}
          <button
            onClick={() => navigate("/documents")}
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-foreground w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Documents
          </button>

          {/* No Analysis State */}
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="h-16 w-16 bg-surface rounded-lg mx-auto flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-text-secondary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">No Analysis Yet</h2>
              <p className="text-sm text-text-secondary max-w-md">
                Start a compliance analysis by uploading a document to compare against a base document.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (docLoading || statusLoading) {
    return (
      <div className="flex-1 p-8 text-center">
        <Loader className="h-8 w-8 animate-spin text-accent-600 mx-auto mb-4" />
        <p className="text-text-secondary">Loading analysis...</p>
      </div>
    );
  }

  if (!documentData) {
    return <div className="flex-1 p-8 text-critical">Document not found</div>;
  }

  // Processing state
  if (comparisonStatus === "processing") {
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

          <Card className="border-0 bg-slate-900/50">
            <CardContent className="pt-8 text-center">
              <div className="flex justify-center mb-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
              <p className="text-slate-400">Analysis in progress...</p>
              <p className="text-xs text-slate-500 mt-2">
                Checking compliance against requirements. This typically takes 5-10 minutes.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Failed state
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

          <Card className="border-0 bg-red-900/10 border-red-500/50">
            <CardContent className="pt-8 text-center">
              <AlertCircle className="h-8 w-8 text-critical mx-auto mb-4" />
              <p className="text-critical">Analysis Failed</p>
              <p className="text-xs text-slate-500 mt-2">
                {statusData?.error_message || "An error occurred while processing the analysis."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!reportData || reportLoading) {
    return (
      <div className="flex-1 p-8 text-center">
        <Loader className="h-8 w-8 animate-spin text-accent-600 mx-auto mb-4" />
        <p className="text-text-secondary">Loading report...</p>
      </div>
    );
  }

  const { report, findings } = reportData;

  // Determine score color based on compliance score
  const scoreColor =
    report.compliance_score >= 80
      ? "text-success"
      : report.compliance_score >= 60
        ? "text-warning"
        : "text-critical";

  const scoreEmoji =
    report.compliance_score >= 80 ? "🟢" : report.compliance_score >= 60 ? "🟡" : "🔴";

  // Filter findings by severity
  const criticalFindings = findings.filter((f) => f.severity === "critical");
  const mediumFindings = findings.filter((f) => f.severity === "medium");
  const lowFindings = findings.filter((f) => f.severity === "low");

  // Severity badge colors
  const severityColor = {
    critical: "bg-critical/10 text-critical",
    medium: "bg-warning/10 text-warning",
    low: "bg-success/10 text-success",
  };

  const renderFindingsList = (items: ComplianceFinding[]) => {
    if (items.length === 0) {
      return <p className="text-sm text-text-secondary py-4">No findings in this category</p>;
    }

    return (
      <div className="space-y-4">
        {items.map((finding) => (
          <Card key={finding.id} className="border-border">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground">{finding.issue}</h4>
                    <p className="text-sm text-text-secondary mt-1">{finding.recommendation}</p>
                  </div>
                  <Badge className={severityColor[finding.severity]}>
                    {finding.severity}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs pt-3 border-t border-border">
                  <div>
                    <p className="text-text-secondary">Document A Section</p>
                    <p className="text-foreground font-medium">{finding.doc_a_section}</p>
                  </div>
                  <div>
                    <p className="text-text-secondary">Document B Section</p>
                    <p className="text-foreground font-medium">{finding.doc_b_section}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-background">
      <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-6">
        {/* Back Link */}
        <button
          onClick={() => navigate("/documents")}
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-foreground w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Documents
        </button>

        {/* Header with title and action buttons */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{documentData.name}</h1>
            <p className="text-sm text-text-secondary mt-1">Compliance Analysis Results</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Download Report
            </Button>
            <Button className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Ask AI Assistant
            </Button>
          </div>
        </div>

        {/* Overview Card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Compliance Assessment</CardTitle>
            <CardDescription>Overall compliance score and findings summary</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-6">
              <div className="col-span-2">
                <p className={`text-5xl font-bold ${scoreColor}`}>
                  {scoreEmoji} {report.compliance_score}%
                </p>
                <p className="text-sm text-text-secondary mt-2">{report.summary}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-text-secondary uppercase tracking-wider">Critical</p>
                <p className="text-3xl font-bold text-critical mt-2">{report.critical_count}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-text-secondary uppercase tracking-wider">Medium</p>
                <p className="text-3xl font-bold text-warning mt-2">{report.medium_count}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-text-secondary uppercase tracking-wider">Low</p>
                <p className="text-3xl font-bold text-success mt-2">{report.low_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Findings Tabs */}
        <Tabs defaultValue="all" className="w-full flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">
              All ({report.total_findings})
            </TabsTrigger>
            <TabsTrigger value="critical">
              Critical ({report.critical_count})
            </TabsTrigger>
            <TabsTrigger value="medium">
              Medium ({report.medium_count})
            </TabsTrigger>
            <TabsTrigger value="low">
              Low ({report.low_count})
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto mt-6">
            <TabsContent value="all" className="space-y-4">
              {renderFindingsList(findings)}
            </TabsContent>

            <TabsContent value="critical" className="space-y-4">
              {renderFindingsList(criticalFindings)}
            </TabsContent>

            <TabsContent value="medium" className="space-y-4">
              {renderFindingsList(mediumFindings)}
            </TabsContent>

            <TabsContent value="low" className="space-y-4">
              {renderFindingsList(lowFindings)}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
