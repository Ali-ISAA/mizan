import { FileText, Clock, CheckCircle, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";

interface Doc {
  id: string;
  name: string;
  file_type: string | null;
  processing_status: string;
  compliance_score: number | null;
  latest_comparison_status: string | null;
  created_at: string;
}

function getStatus(doc: Doc): "compliant" | "warning" | "critical" | "processing" {
  if (doc.processing_status !== "completed") return "processing";
  if (!doc.latest_comparison_status || doc.latest_comparison_status !== "completed") return "processing";
  const s = doc.compliance_score ?? 0;
  if (s >= 80) return "compliant";
  if (s >= 50) return "warning";
  return "critical";
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const statusConfig = {
  compliant:  { icon: CheckCircle,   className: "badge-compliant", label: "Compliant" },
  warning:    { icon: AlertTriangle, className: "badge-warning",   label: "Needs Review" },
  critical:   { icon: XCircle,       className: "badge-critical",  label: "Critical Issues" },
  processing: { icon: Clock,         className: "bg-secondary text-secondary-foreground", label: "Processing" },
};

export function RecentUploads() {
  const { data: docs = [], isLoading } = useQuery<Doc[]>({
    queryKey: ["documents"],
    queryFn: () => api.get("/documents").then(r => r.data),
    staleTime: 30_000,
  });

  const recent = docs.slice(0, 5);

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle>Recent Uploads</CardTitle>
          <CardDescription>Latest documents uploaded for compliance checking</CardDescription>
        </div>
        <Link to="/documents" className="text-xs text-primary hover:underline">View all</Link>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && recent.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No documents uploaded yet.</p>
        )}
        <div className="space-y-4">
          {recent.map((doc, index) => {
            const status = getStatus(doc);
            const cfg = statusConfig[status];
            const StatusIcon = cfg.icon;
            return (
              <Link
                key={doc.id}
                to={`/documents/${doc.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-surface hover:bg-surface-hover interactive animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium truncate max-w-[180px]">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.file_type?.toUpperCase() ?? "DOC"} • {timeAgo(doc.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {doc.compliance_score != null && status !== "processing" && (
                    <div className="text-right">
                      <p className="text-sm font-medium">{doc.compliance_score}%</p>
                      <p className="text-xs text-muted-foreground">Score</p>
                    </div>
                  )}
                  <Badge className={`${cfg.className} flex items-center gap-1`}>
                    <StatusIcon className="h-3 w-3" />
                    {cfg.label}
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
