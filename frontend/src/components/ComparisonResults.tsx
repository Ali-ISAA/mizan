// frontend/src/components/ComparisonResults.tsx
import { useComparison } from "@/hooks/useComparison";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, AlertTriangle, AlertCircle, Loader } from "lucide-react";
import { ProgressIndicator } from "@/components/ProgressIndicator";

interface ComparisonResultsProps {
  comparisonId: string | null;
}

export const ComparisonResults = ({ comparisonId }: ComparisonResultsProps) => {
  const {
    status,
    report,
    findings,
    isLoading,
    error,
    startedAt,
    currentChunk,
    totalChunks,
    estimatedCompletion,
  } = useComparison(comparisonId);

  if (!comparisonId) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">No comparison started</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <Loader className="h-8 w-8 animate-spin text-accent-600 mx-auto mb-4" />
        <p className="text-text-secondary">
          {status === "processing" ? "Analyzing document..." : "Loading results..."}
        </p>
      </div>
    );
  }

  if (status === "processing") {
    return (
      <ProgressIndicator
        currentChunk={currentChunk || 0}
        totalChunks={totalChunks || 0}
        startedAt={startedAt || new Date().toISOString()}
        estimatedCompletion={estimatedCompletion || new Date(Date.now() + 600000).toISOString()}
      />
    );
  }

  if (status === "failed") {
    return (
      <div className="bg-critical/5 border border-critical/30 rounded-lg p-8">
        <AlertCircle className="h-12 w-12 text-critical mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Analysis Failed</h3>
        <p className="text-sm text-critical">{error || "Unknown error"}</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">No results available</p>
      </div>
    );
  }

  const scoreColor =
    report.compliance_score >= 80
      ? "text-success"
      : report.compliance_score >= 60
        ? "text-warning"
        : "text-critical";

  const scoreEmoji =
    report.compliance_score >= 80 ? "🟢" : report.compliance_score >= 60 ? "🟡" : "🔴";

  return (
    <div className="space-y-6">
      {/* Score Card */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Compliance Score</CardTitle>
          <CardDescription>Overall compliance assessment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-5xl font-bold ${scoreColor}`}>
                {scoreEmoji} {report.compliance_score}%
              </p>
              <p className="text-sm text-text-secondary mt-2">{report.summary}</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-critical">{report.critical_count}</p>
                <p className="text-xs text-text-secondary">Critical</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-warning">{report.medium_count}</p>
                <p className="text-xs text-text-secondary">Medium</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-success">{report.low_count}</p>
                <p className="text-xs text-text-secondary">Low</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Findings Table */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Findings</CardTitle>
          <CardDescription>{report.total_findings} issues identified</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {findings.map((finding) => (
                <TableRow key={finding.id}>
                  <TableCell>
                    <Badge
                      variant={
                        finding.status === "compliant"
                          ? "success"
                          : finding.status === "gap"
                            ? "warning"
                            : "critical"
                      }
                    >
                      {finding.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        finding.severity === "critical"
                          ? "critical"
                          : finding.severity === "medium"
                            ? "warning"
                            : "outline"
                      }
                    >
                      {finding.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <span className="text-sm">{finding.issue}</span>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <span className="text-sm text-text-secondary">{finding.recommendation}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
