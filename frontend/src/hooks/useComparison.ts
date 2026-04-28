// frontend/src/hooks/useComparison.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";

const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds while processing

interface ComparisonStatus {
  status: "pending" | "processing" | "completed" | "failed";
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

interface ComparisonReport {
  id: string;
  compliance_score: number;
  total_findings: number;
  critical_count: number;
  medium_count: number;
  low_count: number;
  summary: string;
}

interface ComparisonFinding {
  id: string;
  doc_a_section: string;
  doc_b_section: string;
  status: "compliant" | "gap" | "conflict" | "missing";
  severity: "critical" | "medium" | "low";
  issue: string;
  recommendation: string;
}

interface ReportResponse {
  report: ComparisonReport;
  findings: ComparisonFinding[];
}

export const useComparison = (comparisonId: string | null) => {
  const queryClient = useQueryClient();

  // Poll for status
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

  // Fetch report once completed
  const { data: reportData, isLoading: reportLoading } = useQuery<ReportResponse | null>({
    queryKey: ["comparison-report", comparisonId],
    queryFn: () =>
      comparisonId && statusData?.status === "completed"
        ? api
            .get<ReportResponse>(`/documents/comparisons/${comparisonId}/report`)
            .then((r) => r.data)
            .catch(() => null)
        : null,
    enabled: !!comparisonId && statusData?.status === "completed",
  });

  return {
    comparisonId,
    status: (statusData?.status || "pending") as "pending" | "processing" | "completed" | "failed",
    report: reportData?.report || null,
    findings: reportData?.findings || [],
    isLoading: statusLoading || reportLoading,
    startedAt: statusData?.started_at,
    completedAt: statusData?.completed_at,
    error: statusData?.error_message,
  };
};
