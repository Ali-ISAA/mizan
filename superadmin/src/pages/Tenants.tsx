import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  max_users: number;
  max_documents: number;
  max_storage_gb: number;
  user_count: number;
  created_at: string;
}

const PLAN_COLORS: Record<string, string> = {
  free:       "bg-gray-100 text-gray-600",
  starter:    "bg-blue-100 text-blue-700",
  pro:        "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

export default function Tenants() {
  const { data: tenants = [], isLoading } = useQuery<TenantRow[]>({
    queryKey: ["sa-tenants"],
    queryFn: () => api.get("/superadmin/tenants").then(r => r.data),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Tenants</h2>
        <p className="text-sm text-gray-500 mt-0.5">All organizations on the platform</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Tenants", value: tenants.length },
          { label: "Active",        value: tenants.filter(t => t.is_active).length },
          { label: "Total Users",   value: tenants.reduce((sum, t) => sum + t.user_count, 0) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border rounded-lg p-4">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Organization", "Plan", "Users", "Limits", "Status", "Created"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {!isLoading && tenants.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No tenants yet</td></tr>
            )}
            {tenants.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{t.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${PLAN_COLORS[t.plan] ?? "bg-gray-100 text-gray-600"}`}>
                    {t.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-gray-900">{t.user_count}</span>
                  <span className="text-gray-400"> / {t.max_users}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 space-y-0.5">
                  <p>{t.max_documents.toLocaleString()} docs</p>
                  <p>{t.max_storage_gb} GB storage</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {t.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
