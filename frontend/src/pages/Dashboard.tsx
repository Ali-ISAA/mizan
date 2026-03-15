import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, FolderOpen, Plus, TrendingUp } from "lucide-react";
import { api } from "../lib/api";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  overall_score: number | null;
  requirements_count: number;
  met_count: number;
  partial_count: number;
  not_met_count: number;
  created_at: string;
}

function scoreColor(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-slate-100 text-slate-600",
    processing: "bg-blue-100 text-blue-700",
    complete: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] || map.pending}`}>{status}</span>;
}

export default function Dashboard() {
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects").then(r => r.data),
  });

  const complete = projects.filter(p => p.status === "complete");
  const avgScore = complete.length ? Math.round(complete.reduce((s, p) => s + (p.overall_score || 0), 0) / complete.length) : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Compliance analysis overview</p>
        </div>
        <Link to="/projects" className="flex items-center gap-2 bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Project
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Projects", value: projects.length, icon: FolderOpen, color: "text-blue-600 bg-blue-50" },
          { label: "Completed", value: complete.length, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
          { label: "In Progress", value: projects.filter(p => p.status === "processing").length, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
          { label: "Avg Score", value: avgScore !== null ? `${avgScore}%` : "—", icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border rounded-lg p-4 flex items-center gap-4">
            <div className={`rounded-lg p-2.5 ${color}`}><Icon className="h-5 w-5" /></div>
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent projects */}
      <div>
        <h2 className="text-base font-semibold mb-3">Recent Projects</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : projects.length === 0 ? (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No projects yet.</p>
            <Link to="/projects" className="text-sm text-primary hover:underline">Create your first project</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.slice(0, 8).map(p => (
              <Link key={p.id} to={p.status === "complete" ? `/projects/${p.id}/results` : `/projects/${p.id}`} className="block bg-card border rounded-lg p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {p.overall_score !== null && (
                      <span className={`text-sm font-bold ${scoreColor(p.overall_score)}`}>{p.overall_score.toFixed(1)}%</span>
                    )}
                    <StatusBadge status={p.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
