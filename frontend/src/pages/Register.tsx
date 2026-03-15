import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Scale } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

export default function Register() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", org_name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", form);
      setAuth(data);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Scale className="h-10 w-10 text-primary mb-2" />
          <h1 className="text-2xl font-bold">Mizan</h1>
          <p className="text-muted-foreground text-sm">Compliance Analysis Platform</p>
        </div>
        <div className="bg-card border rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Create account</h2>
          <form onSubmit={submit} className="space-y-4">
            {[
              { field: "full_name", label: "Full name", type: "text" },
              { field: "org_name", label: "Organization", type: "text" },
              { field: "email", label: "Email", type: "email" },
              { field: "password", label: "Password", type: "password" },
            ].map(({ field, label, type }) => (
              <div key={field}>
                <label className="block text-sm font-medium mb-1">{label}</label>
                <input className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" type={type} value={(form as any)[field]} onChange={e => set(field, e.target.value)} required />
              </div>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {loading ? "Creating..." : "Create account"}
            </button>
          </form>
          <p className="text-sm text-muted-foreground mt-4 text-center">
            Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
