import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Stats { tenants: number; users: number; }
interface Tenant { id: string; name: string; slug: string; plan: string; is_active: boolean; created_at: string; }
interface BaseDocStats { total: number; by_type: Record<string, number>; by_status: Record<string, number>; }
interface AuditEvent {
  id: string;
  tenant_name: string | null;
  action: string;
  severity: string;
  title: string;
  description: string | null;
  actor_email: string | null;
  created_at: string;
}

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(isoString).toLocaleDateString();
}

const SEVERITY_BADGE: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  error:   "bg-red-100 text-red-700",
  info:    "bg-blue-100 text-blue-700",
};

const DOC_TYPES = ["GDPR", "SOX", "HIPAA", "ISO 27001", "CCPA", "PCI DSS", "Others"];
const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function Dashboard() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ["sa-stats"],
    queryFn: () => api.get("/superadmin/stats").then(r => r.data),
  });
  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["sa-tenants"],
    queryFn: () => api.get("/superadmin/tenants").then(r => r.data),
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">System overview</p>
      </div>

      {/* System stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Tenants", value: stats?.tenants ?? "—" },
          { label: "Users", value: stats?.users ?? "—" },
          { label: "Base Documents", value: docStats?.total ?? "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border rounded-lg p-4">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Base docs by type */}
      {docStats && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900">Base Documents by Type</h3>
          </div>
          <div className="p-4 grid grid-cols-4 gap-3">
            {DOC_TYPES.map(type => (
              <div key={type} className="border rounded-md p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{docStats.by_type[type] ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">{type}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Base docs by status */}
      {docStats && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900">Processing Status</h3>
          </div>
          <div className="p-4 flex gap-3 flex-wrap">
            {Object.entries(docStats.by_status).map(([status, count]) => (
              <span key={status} className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
                {status}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-900">Recent Activity</h3>
          <p className="text-xs text-gray-400 mt-0.5">Last 5 events across all tenants</p>
        </div>
        <div className="divide-y">
          {auditEvents.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">No activity yet</p>
          )}
          {auditEvents.slice(0, 5).map(ev => (
            <div key={ev.id} className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">{ev.title}</p>
                  <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_BADGE[ev.severity] ?? SEVERITY_BADGE.info}`}>
                    {ev.severity}
                  </span>
                </div>
                {ev.description && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{ev.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>{timeAgo(ev.created_at)}</span>
                  {ev.tenant_name && <span className="font-medium">{ev.tenant_name}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Logs */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-900">Audit Logs</h3>
          <p className="text-xs text-gray-400 mt-0.5">Who did what, across all tenants</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Event", "Actor", "Tenant", "Severity", "When"].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {auditEvents.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-sm">No events yet</td></tr>
            )}
            {auditEvents.map(ev => (
              <tr key={ev.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-gray-900">{ev.title}</p>
                  {ev.description && <p className="text-xs text-gray-400 truncate max-w-xs">{ev.description}</p>}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{ev.actor_email || "—"}</td>
                <td className="px-4 py-2.5 text-xs text-gray-600">{ev.tenant_name || "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_BADGE[ev.severity] ?? SEVERITY_BADGE.info}`}>
                    {ev.severity}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(ev.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tenants table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-900">Tenants</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Name", "Slug", "Plan", "Status", "Created"].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenants.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{t.name}</td>
                <td className="px-4 py-2 text-gray-500 font-mono text-xs">{t.slug}</td>
                <td className="px-4 py-2">{t.plan}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {t.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-400 text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No tenants yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
