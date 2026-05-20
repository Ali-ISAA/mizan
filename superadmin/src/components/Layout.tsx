import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Users, Building2, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/use-theme";

const navItems = [
  { title: "Dashboard",      url: "/",          icon: LayoutDashboard },
  { title: "Tenants",        url: "/tenants",   icon: Building2 },
  { title: "Users",          url: "/users",     icon: Users },
  { title: "Base Documents", url: "/documents", icon: FileText },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  function logout() {
    localStorage.removeItem("sa_token");
    navigate("/login");
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col border-r border-sidebar-border"
        style={{ background: "var(--gradient-sidebar)" }}
      >
        {/* Header — matches frontend h-20 */}
        <div className="h-20 px-4 border-b border-sidebar-border/50 flex items-center">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-12 w-12 flex items-center justify-center">
              <img src="/mizan-logo.png" alt="Mizan" className="h-full w-full object-contain" />
            </div>
            <div className="leading-none">
              <h2 className="text-base font-semibold text-sidebar-foreground tracking-tight leading-tight">
                Mizan AI
              </h2>
              <p className="text-xs text-sidebar-foreground/60 font-medium leading-tight mt-0.5">
                Superadmin
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <p className="px-3 text-xs uppercase tracking-wider text-sidebar-foreground/50 font-semibold mb-2">
            Navigation
          </p>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.url}>
                <NavLink
                  to={item.url}
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 relative group
                    ${isActive
                      ? "bg-sidebar-accent text-accent-600 font-medium shadow-sm"
                      : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent-600 rounded-r-full" />
                      )}
                      <item.icon
                        className={`h-4 w-4 flex-shrink-0 transition-all duration-200
                          ${isActive ? "text-accent-600 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "group-hover:scale-110"}`}
                      />
                      <span className="text-sm">{item.title}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-sidebar-border/50">
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-all duration-200 group"
          >
            <LogOut className="h-4 w-4 flex-shrink-0 group-hover:scale-110 transition-all duration-200" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar — matches frontend h-20 */}
        <header className="h-20 flex items-center justify-end px-6 border-b border-border bg-background flex-shrink-0 shadow-sm">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-lg hover:bg-surface transition-colors relative"
          >
            <Sun className="h-5 w-5 text-foreground/70 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute top-2 right-2 h-5 w-5 text-foreground/70 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
