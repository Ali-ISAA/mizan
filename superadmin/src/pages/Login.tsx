import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/superadmin/login", { email, password });
      localStorage.setItem("sa_token", data.access_token);
      navigate("/");
    } catch {
      setError("Invalid credentials");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-80 bg-white border rounded-lg p-6 shadow-sm">
        <h1 className="text-xl font-bold mb-1">Mizan Superadmin</h1>
        <p className="text-sm text-gray-500 mb-4">System administration</p>
        <form onSubmit={submit} className="space-y-3">
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && (
            <div>
              <p className="text-sm text-red-600">{error}</p>
              <p className="text-xs text-gray-400 mt-1">Default: admin@mizan.com / admin123</p>
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
