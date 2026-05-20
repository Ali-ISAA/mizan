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
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/superadmin/login", { email, password });
      localStorage.setItem("sa_token", data.access_token);
      navigate("/");
    } catch {
      setError("Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 to-primary-950 relative">
      {/* Dark mode toggle */}
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
      >
        <Sun className="h-5 w-5 text-white/70 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute top-2 right-2 h-5 w-5 text-white/70 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </button>

      {/* Card */}
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="text-center px-8 pt-8 pb-6">
          <div className="flex justify-center mb-4">
            <img src="/mizan-logo.png" alt="Mizan" className="h-24 w-24 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Mizan Superadmin</h1>
          <p className="text-sm text-text-muted mt-1">System administration</p>
        </div>

        {/* Form */}
        <div className="px-8 pb-8">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <input
                className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-transparent transition-all"
                placeholder="admin@mizan.com"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Password</label>
              <input
                className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-transparent transition-all"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-critical">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-all duration-200 hover:shadow-glow-blue"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
