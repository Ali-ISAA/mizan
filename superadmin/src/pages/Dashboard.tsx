import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface Tenant { id: string; name: string; slug: string; plan: string; is_active: boolean; created_at: string; }
interface Stats { tenants: number; users: number; }

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: stats } = useQuery<Stats>({ queryKey: ["sa-stats"], queryFn: () => api.get("/superadmin/stats").then(r => r.data) });
  const { data: tenants = [] } = useQuery<Tenant[]>({ queryKey: ["sa-tenants"], queryFn: () => api.get("/superadmin/tenants").then(r => r.data) });

  function logout() { localStorage.removeItem("sa_token"); navigate("/login"); }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <h1 className="font-bold text-lg">Mizan Superadmin</h1>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">Sign out</button>
      </header>
      <main className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          {[{ label: "Tenants", value: stats?.tenants ?? "—" }, { label: "Users", value: stats?.users ?? "—" }].map(({ label, value }) => (
            <div key={label} className="bg-white border rounded-lg p-4">
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Tenants table */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold">Tenants</h2>
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
      </main>
    </div>
  );
}
