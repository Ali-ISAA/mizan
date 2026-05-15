import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Users, Building2, LogOut } from "lucide-react";

const navItems = [
  { title: "Dashboard",      url: "/",          icon: LayoutDashboard },
  { title: "Tenants",        url: "/tenants",   icon: Building2 },
  { title: "Users",          url: "/users",     icon: Users },
  { title: "Base Documents", url: "/documents", icon: FileText },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("sa_token");
    navigate("/login");
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <img src="/mizan-logo.png" alt="Mizan" className="h-8 w-8 rounded-lg object-contain" />
            <div>
              <h1 className="text-white font-bold text-base leading-tight">Mizan</h1>
              <p className="text-slate-400 text-xs">Superadmin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-slate-700 text-white font-medium"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`
              }
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.title}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-700">
          <button
            onClick={logout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
