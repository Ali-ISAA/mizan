import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Users, Building2, FileText, Activity } from "lucide-react";

interface Stats { tenants: number; users: number; }
interface BaseDocStats { total: number; by_type: Record<string, number>; by_status: Record<string, number>; }
interface AuditEvent {
  id: string; tenant_name: string | null; action: string; severity: string;
  title: string; description: string | null; actor_email: string | null; created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === "success" ? "badge-compliant" :
    severity === "warning" ? "badge-warning" :
    severity === "error"   ? "badge-critical" :
    "badge-info";
  return <span className={cls}>{severity}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"  ? "badge-compliant" :
    status === "processing" ? "badge-info" :
    status === "pending"    ? "badge-warning" :
    "badge-critical";
  return <span className={cls}>{status}</span>;
}

const DOC_TYPES = ["GDPR", "SOX", "HIPAA", "ISO 27001", "CCPA", "PCI DSS", "Others"];

export default function Dashboard() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ["sa-stats"],
    queryFn: () => api.get("/superadmin/stats").then(r => r.data),
  });
  const { data: docStats } = useQuery<BaseDocStats>({
    queryKey: ["sa-base-doc-stats"],
    queryFn: () => api.get("/superadmin/base-documents/stats").then(r => r.data),
  });
  const { data: auditEvents = [] } = useQuery<AuditEvent[]>({
    queryKey: ["sa-audit-all"],
    queryFn: () => api.get("/superadmin/audit?limit=10").then(r => r.data),
    refetchInterval: 30_000,
  });

  const statCards = [
    { label: "Total Tenants",    value: stats?.tenants ?? "—",   icon: Building2, color: "text-accent-600" },
    { label: "Total Users",      value: stats?.users   ?? "—",   icon: Users,     color: "text-success" },
    { label: "Base Documents",   value: docStats?.total ?? "—",  icon: FileText,  color: "text-warning" },
    { label: "Recent Events",    value: auditEvents.length,      icon: Activity,  color: "text-critical" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-text-muted mt-0.5">System overview across all tenants</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</p>
              <div className={`p-1.5 rounded-md bg-surface ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Base docs by type */}
      {docStats && (
        <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Base Documents by Type</h3>
          </div>
          <div className="p-6 grid grid-cols-4 gap-3">
            {DOC_TYPES.map(type => (
              <div key={type} className="bg-surface border border-border rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-foreground">{docStats.by_type[type] ?? 0}</p>
                <p className="text-xs text-text-muted mt-1">{type}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processing status */}
      {docStats && (
        <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Processing Status</h3>
          </div>
          <div className="px-6 py-4 flex gap-3 flex-wrap">
            {Object.entries(docStats.by_status).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <StatusBadge status={status} />
                <span className="text-sm font-semibold text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit log table */}
      <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Audit Log</h3>
          <p className="text-xs text-text-muted mt-0.5">Recent activity across all tenants</p>
        </div>
        <table className="table-modern">
          <thead>
            <tr>
              {["Event", "Actor", "Tenant", "Severity", "When"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {auditEvents.length === 0 && (
              <tr><td colSpan={5} className="text-center text-text-muted py-8">No activity yet</td></tr>
            )}
            {auditEvents.map(ev => (
              <tr key={ev.id}>
                <td>
                  <p className="font-medium text-foreground">{ev.title}</p>
                  {ev.description && <p className="text-xs text-text-muted truncate max-w-xs mt-0.5">{ev.description}</p>}
                </td>
                <td className="font-mono text-xs text-text-secondary">{ev.actor_email || "—"}</td>
                <td className="text-text-secondary">{ev.tenant_name || "—"}</td>
                <td><SeverityBadge severity={ev.severity} /></td>
                <td className="text-text-muted">{timeAgo(ev.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
