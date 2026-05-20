import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface TenantRow {
  id: string; name: string; slug: string; plan: string; is_active: boolean;
  max_users: number; max_documents: number; max_storage_gb: number;
  user_count: number; created_at: string;
}

function PlanBadge({ plan }: { plan: string }) {
  const cls =
    plan === "enterprise" ? "badge-warning" :
    plan === "pro"        ? "badge-info" :
    plan === "starter"    ? "badge-compliant" :
    "badge-neutral";
  return <span className={cls}>{plan}</span>;
}

export default function Tenants() {
  const { data: tenants = [], isLoading } = useQuery<TenantRow[]>({
    queryKey: ["sa-tenants"],
    queryFn: () => api.get("/superadmin/tenants").then(r => r.data),
  });

  const summaryCards = [
    { label: "Total Tenants", value: tenants.length },
    { label: "Active",        value: tenants.filter(t => t.is_active).length },
    { label: "Total Users",   value: tenants.reduce((s, t) => s + t.user_count, 0) },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Tenants</h2>
        <p className="text-sm text-text-muted mt-0.5">All organizations on the platform</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {summaryCards.map(({ label, value }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-5 shadow-sm">
            <p className="text-3xl font-bold text-foreground">{value}</p>
            <p className="text-sm text-text-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
        <table className="table-modern">
          <thead>
            <tr>
              {["Organization", "Plan", "Users", "Limits", "Status", "Created"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="text-center text-text-muted py-8">Loading...</td></tr>
            )}
            {!isLoading && tenants.length === 0 && (
              <tr><td colSpan={6} className="text-center text-text-muted py-8">No tenants yet</td></tr>
            )}
            {tenants.map(t => (
              <tr key={t.id}>
                <td>
                  <p className="font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-text-muted font-mono mt-0.5">{t.slug}</p>
                </td>
                <td><PlanBadge plan={t.plan} /></td>
                <td>
                  <span className="font-semibold text-foreground">{t.user_count}</span>
                  <span className="text-text-muted"> / {t.max_users}</span>
                </td>
                <td className="text-text-secondary space-y-0.5">
                  <p className="text-xs">{t.max_documents.toLocaleString()} docs</p>
                  <p className="text-xs">{t.max_storage_gb} GB</p>
                </td>
                <td>
                  <span className={t.is_active ? "badge-compliant" : "badge-critical"}>
                    {t.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="text-text-muted text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
