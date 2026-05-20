import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface UserRow {
  id: string; email: string; full_name: string | null; role: string;
  is_active: boolean; tenant_id: string; tenant_name: string; created_at: string;
}

function RoleBadge({ role }: { role: string }) {
  const cls =
    role === "owner"  ? "badge-warning" :
    role === "admin"  ? "badge-info" :
    "badge-neutral";
  return <span className={cls}>{role}</span>;
}

export default function Users() {
  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ["sa-users"],
    queryFn: () => api.get("/superadmin/users").then(r => r.data),
  });

  const summaryCards = [
    { label: "Total Users", value: users.length },
    { label: "Active",      value: users.filter(u => u.is_active).length },
    { label: "Owners",      value: users.filter(u => u.role === "owner").length },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Users</h2>
        <p className="text-sm text-text-muted mt-0.5">All users across all tenants</p>
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
              {["Name / Email", "Role", "Tenant", "Status", "Joined"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="text-center text-text-muted py-8">Loading...</td></tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr><td colSpan={5} className="text-center text-text-muted py-8">No users yet</td></tr>
            )}
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <p className="font-medium text-foreground">{u.full_name || "—"}</p>
                  <p className="text-xs text-text-muted mt-0.5">{u.email}</p>
                </td>
                <td><RoleBadge role={u.role} /></td>
                <td className="text-text-secondary">{u.tenant_name}</td>
                <td>
                  <span className={u.is_active ? "badge-compliant" : "badge-critical"}>
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="text-text-muted text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
