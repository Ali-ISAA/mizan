import { Bell, Search, User, Moon, Sun, LogOut, CheckCircle, AlertTriangle, FileText, Shield, LogIn, Activity, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";

interface ActivityEvent {
  id: string;
  action: string;
  severity: string;
  title: string;
  description: string | null;
  created_at: string;
}

const ACTION_ICON: Record<string, React.ElementType> = {
  document_uploaded:  FileText,
  analysis_started:   Shield,
  analysis_completed: CheckCircle,
  analysis_failed:    AlertTriangle,
  user_login:         LogIn,
};

const SEVERITY_STYLE: Record<string, { dot: string; badge: string; label: string }> = {
  error:   { dot: "bg-critical",  badge: "bg-critical/15 text-critical border border-critical/20",   label: "Error" },
  warning: { dot: "bg-warning",   badge: "bg-warning/15 text-warning border border-warning/20",     label: "Warning" },
  success: { dot: "bg-success",   badge: "bg-success/15 text-success border border-success/20",     label: "Success" },
  info:    { dot: "bg-accent-600",badge: "bg-accent-600/15 text-accent-600 border border-accent-600/20", label: "Info" },
};

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function AppHeader() {
  const { theme, setTheme } = useTheme();
  const { userEmail, logout } = useAuth();
  const navigate = useNavigate();

  const { data: activityEvents = [] } = useQuery<ActivityEvent[]>({
    queryKey: ["activity-notifications"],
    queryFn: () => api.get("/activity?limit=50").then(r => r.data),
    refetchInterval: 30_000,
  });

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recentEvents = activityEvents.filter(e => new Date(e.created_at).getTime() > cutoff);
  const notificationCount = recentEvents.filter(e => e.severity === "error").length;

  // Get initials from email
  const getInitials = (email: string | null) => {
    if (!email) return "U";
    const name = email.split("@")[0];
    return name.substring(0, 2).toUpperCase();
  };

  // Get display name from email
  const getDisplayName = (email: string | null) => {
    if (!email) return "User";
    const name = email.split("@")[0];
    return name
      .split(/[._-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-20 items-center gap-4 px-6">
        {/* Sidebar Toggle */}
        <SidebarTrigger className="transition-all duration-200 hover:bg-surface rounded-lg" />

        {/* Search Bar - Centered */}
        <div className="flex flex-1 items-center justify-center gap-4">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted transition-colors" />
            <Input
              placeholder="Search documents, rules, or compliance data..."
              className="pl-10 pr-4 h-10 bg-surface border-border hover:border-accent-600 focus:border-accent-600 transition-all"
            />
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="rounded-lg hover:bg-surface transition-all duration-200"
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-lg hover:bg-surface transition-all duration-200"
              >
                <Bell className="h-[1.2rem] w-[1.2rem]" />
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-critical text-[10px] font-semibold text-white shadow-glow-critical">
                    {notificationCount > 9 ? "9+" : notificationCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-80 bg-surface-elevated border-border shadow-xl rounded-lg p-0 overflow-hidden"
              align="end"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-foreground" />
                  <span className="text-sm font-semibold text-foreground">Notifications</span>
                  {notificationCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-critical/15 text-critical border border-critical/20 font-medium">
                      {notificationCount} new
                    </span>
                  )}
                </div>
              </div>

              {/* Events list */}
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {recentEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted">
                    <CheckCircle className="h-8 w-8 text-success/50" />
                    <p className="text-sm">All clear — no recent events</p>
                  </div>
                ) : (
                  recentEvents.slice(0, 10).map(event => {
                    const Icon = ACTION_ICON[event.action] ?? Activity;
                    const sev = SEVERITY_STYLE[event.severity] ?? SEVERITY_STYLE.info;
                    return (
                      <div
                        key={event.id}
                        className="flex gap-3 px-4 py-3 hover:bg-surface/60 transition-colors border-b border-border/50 last:border-0"
                      >
                        <div className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${sev.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium text-foreground leading-snug">{event.title}</p>
                            <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sev.badge}`}>
                              {sev.label}
                            </span>
                          </div>
                          {event.description && (
                            <p className="text-xs text-text-muted mt-0.5 truncate">{event.description}</p>
                          )}
                          <p className="text-[10px] text-text-muted mt-1">{timeAgo(event.created_at)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              {recentEvents.length > 0 && (
                <div className="border-t border-border px-4 py-2.5">
                  <button
                    onClick={() => navigate("/activity")}
                    className="text-xs text-accent-600 hover:text-accent-600/80 font-medium transition-colors w-full text-center"
                  >
                    View all activity →
                  </button>
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full hover:ring-2 hover:ring-accent-600/20 transition-all duration-200"
              >
                <Avatar className="h-9 w-9 border-2 border-border">
                  <AvatarImage src="/avatars/01.png" alt="@username" />
                  <AvatarFallback className="bg-gradient-to-br from-accent-600 to-accent-700 text-white font-semibold text-sm">
                    {getInitials(userEmail)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-64 bg-surface-elevated border-border shadow-xl rounded-lg"
              align="end"
              forceMount
            >
              <DropdownMenuLabel className="font-normal p-3">
                <div className="flex flex-col space-y-1.5">
                  <p className="text-sm font-semibold leading-none text-foreground">
                    {getDisplayName(userEmail)}
                  </p>
                  <p className="text-xs leading-none text-text-muted">
                    {userEmail || "user@company.com"}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <div className="p-1">
                <DropdownMenuItem className="rounded-md cursor-pointer transition-colors hover:bg-surface">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-md cursor-pointer transition-colors hover:bg-surface">
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-md cursor-pointer transition-colors hover:bg-surface">
                  Team
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-md cursor-pointer transition-colors hover:bg-surface">
                  Subscription
                </DropdownMenuItem>
              </div>
              <DropdownMenuSeparator className="bg-border" />
              <div className="p-1">
                <DropdownMenuItem
                  className="rounded-md cursor-pointer transition-colors hover:bg-critical/10 hover:text-critical"
                  onClick={logout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
