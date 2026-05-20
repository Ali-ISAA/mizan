import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useTheme } from "../hooks/use-theme";
import { Moon, Sun } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { theme, setTheme } = useTheme();

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 relative">
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors"
      >
        <Sun className="h-5 w-5 text-gray-600 dark:text-slate-400 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute top-2 right-2 h-5 w-5 text-gray-600 dark:text-slate-400 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </button>
      <div className="w-80 bg-white border rounded-lg p-6 shadow-sm">
        <div className="flex justify-center mb-4">
          <img src="/mizan-logo.png" alt="Mizan" className="h-24 w-24 object-contain" />
        </div>
        <h1 className="text-xl font-bold mb-1 text-center">Mizan Superadmin</h1>
        <p className="text-sm text-gray-500 mb-4 text-center">System administration</p>
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
