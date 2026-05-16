import { useState } from "react";
import { Clock, FileText, Shield, AlertTriangle, CheckCircle, LogIn, Activity as ActivityIcon, ChevronRight, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface ActivityEvent {
  id: string;
  action: string;
  severity: string;
  title: string;
  description: string | null;
  actor_email: string | null;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  document_uploaded:  { icon: FileText,      color: "text-accent-600",  bg: "bg-accent-600/15" },
  analysis_started:   { icon: Shield,        color: "text-blue-400",    bg: "bg-blue-400/15" },
  analysis_completed: { icon: CheckCircle,   color: "text-success",     bg: "bg-success/15" },
  analysis_failed:    { icon: AlertTriangle, color: "text-critical",    bg: "bg-critical/15" },
  user_login:         { icon: LogIn,         color: "text-text-secondary", bg: "bg-surface" },
};
const DEFAULT_ACTION = { icon: ActivityIcon, color: "text-text-muted", bg: "bg-surface" };

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  success: { label: "Success", className: "bg-success/15 text-success border border-success/20" },
  warning: { label: "Warning", className: "bg-warning/15 text-warning border border-warning/20" },
  error:   { label: "Error",   className: "bg-critical/15 text-critical border border-critical/20" },
  info:    { label: "Info",    className: "bg-accent-600/15 text-accent-600 border border-accent-600/20" },
};

type FilterKey = "all" | "documents" | "analysis" | "logins";

const FILTER_ACTIONS: Record<FilterKey, string[]> = {
  all:       [],
  documents: ["document_uploaded"],
  analysis:  ["analysis_started", "analysis_completed", "analysis_failed"],
  logins:    ["user_login"],
};

const FILTER_CONFIG: { key: FilterKey; label: string; icon: React.ElementType; color: string; bg: string }[] = [
  { key: "all",       label: "All Events",  icon: ActivityIcon,   color: "text-foreground",     bg: "bg-surface" },
  { key: "documents", label: "Documents",   icon: FileText,       color: "text-accent-600",     bg: "bg-accent-600/15" },
  { key: "analysis",  label: "Analysis",    icon: Shield,         color: "text-blue-400",       bg: "bg-blue-400/15" },
  { key: "logins",    label: "Logins",      icon: LogIn,          color: "text-text-secondary", bg: "bg-surface" },
];

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(isoString).toLocaleDateString();
}

export default function Activity() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const { data: events = [], isLoading, isError } = useQuery<ActivityEvent[]>({
    queryKey: ["activity-all"],
    queryFn: () => api.get("/activity?limit=100").then(r => r.data),
    refetchInterval: 30_000,
  });

  const filterActions = FILTER_ACTIONS[activeFilter];
  const filtered = filterActions.length === 0
    ? events
    : events.filter(e => filterActions.includes(e.action));

  function countFor(key: FilterKey) {
    const actions = FILTER_ACTIONS[key];
    if (actions.length === 0) return events.length;
    return events.filter(e => actions.includes(e.action)).length;
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden p-8 space-y-6 animate-fade-in">

      {/* Page Header */}
      <div className="border-b border-border pb-4 flex-shrink-0">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Activity Log</h1>
        <p className="text-text-secondary mt-1">
          All compliance activities and system events for your organization
        </p>
      </div>

      {/* Body: left panel + right content */}
      <div className="flex gap-6 flex-1 overflow-hidden min-h-0">

        {/* ── Left Filter Panel ── */}
        <div className="w-56 flex-shrink-0 flex flex-col gap-1">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider px-3 mb-2">Filter by type</p>
          {FILTER_CONFIG.map(({ key, label, icon: Icon, color, bg }) => {
            const count = countFor(key);
            const isActive = activeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left group ${
                  isActive
                    ? "bg-accent-600/10 text-accent-600 border border-accent-600/20"
                    : "text-text-secondary hover:bg-surface hover:text-foreground border border-transparent"
                }`}
              >
                <div className={`flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0 ${
                  isActive ? "bg-accent-600/20" : bg
                }`}>
                  <Icon className={`h-3.5 w-3.5 ${isActive ? "text-accent-600" : color}`} />
                </div>
                <span className="flex-1 truncate">{label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium tabular-nums ${
                  isActive
                    ? "bg-accent-600/20 text-accent-600"
                    : "bg-surface text-text-muted"
                }`}>
                  {count}
                </span>
                {isActive && <ChevronRight className="h-3.5 w-3.5 text-accent-600 flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* ── Right Events Panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Card className="card-elevated flex flex-col overflow-hidden h-full">

            <CardHeader className="flex-shrink-0 pb-2">
              <CardTitle>
                {FILTER_CONFIG.find(f => f.key === activeFilter)?.label ?? "All Events"}
              </CardTitle>
              <CardDescription>{filtered.length} events recorded</CardDescription>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-0">
              <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border h-full">
                {isLoading && (
                  <div className="flex items-center justify-center py-16 gap-2 text-text-muted">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading activity…</span>
                  </div>
                )}
                {isError && (
                  <p className="text-sm text-critical text-center py-16">Failed to load activity. Please refresh.</p>
                )}
                {!isLoading && filtered.length === 0 && (
                  <p className="text-sm text-text-muted text-center py-16">No events in this category yet.</p>
                )}

                {filtered.map((event, index) => {
                  const cfg = ACTION_CONFIG[event.action] ?? DEFAULT_ACTION;
                  const sev = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.info;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={event.id}
                      className="flex gap-4 px-6 py-4 hover:bg-surface/50 transition-colors animate-fade-in"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.bg} border border-border`}>
                        <Icon className={`h-4 w-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-foreground leading-snug">{event.title}</p>
                          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${sev.className}`}>
                            {sev.label}
                          </span>
                        </div>
                        {event.description && (
                          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{event.description}</p>
                        )}
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-text-muted">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo(event.created_at)}
                          </span>
                          {event.actor_email && (
                            <span className="font-mono truncate max-w-[200px]">{event.actor_email}</span>
                          )}
                          {event.resource_type && (
                            <span className="capitalize bg-surface px-1.5 py-0.5 rounded border border-border">
                              {event.resource_type}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>

          </Card>
        </div>

      </div>
    </div>
  );
}
