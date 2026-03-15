import { useAuthStore } from "../stores/auth";

export default function Settings() {
  const { email, role, tenantId } = useAuthStore();
  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="bg-card border rounded-lg divide-y">
        {[
          { label: "Email", value: email },
          { label: "Role", value: role },
          { label: "Tenant ID", value: tenantId },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <span className="text-sm font-mono">{value || "—"}</span>
          </div>
        ))}
      </div>
      <div className="bg-card border rounded-lg p-4">
        <h2 className="font-medium mb-1">API Configuration</h2>
        <p className="text-sm text-muted-foreground">API URL: <span className="font-mono text-xs">{import.meta.env.VITE_API_URL || "http://localhost:7001/api/v1"}</span></p>
      </div>
    </div>
  );
}
