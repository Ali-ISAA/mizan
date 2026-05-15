import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  tenant_id: string;
  tenant_name: string;
  created_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  owner:  "bg-purple-100 text-purple-700",
  admin:  "bg-blue-100 text-blue-700",
  member: "bg-gray-100 text-gray-600",
};

export default function Users() {
  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ["sa-users"],
    queryFn: () => api.get("/superadmin/users").then(r => r.data),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Users</h2>
        <p className="text-sm text-gray-500 mt-0.5">All users across all tenants</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Users",  value: users.length },
          { label: "Active",       value: users.filter(u => u.is_active).length },
          { label: "Owners",       value: users.filter(u => u.role === "owner").length },
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
              {["Name / Email", "Role", "Tenant", "Status", "Joined"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No users yet</td></tr>
            )}
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{u.full_name || "—"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.tenant_name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
