import { Clock, FileText, Shield, AlertTriangle, CheckCircle, LogIn } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

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

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  document_uploaded:  { icon: FileText,      color: "text-primary" },
  analysis_started:   { icon: Shield,        color: "text-blue-500" },
  analysis_completed: { icon: CheckCircle,   color: "text-green-500" },
  analysis_failed:    { icon: AlertTriangle, color: "text-destructive" },
  user_login:         { icon: LogIn,         color: "text-muted-foreground" },
};
const DEFAULT_ACTION = { icon: FileText, color: "text-muted-foreground" };

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  success: { label: "Success", className: "bg-green-100 text-green-700" },
  warning: { label: "Warning", className: "bg-yellow-100 text-yellow-700" },
  error:   { label: "Error",   className: "bg-red-100 text-red-700" },
  info:    { label: "Info",    className: "bg-blue-100 text-blue-700" },
};

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(isoString).toLocaleDateString();
}

export default function Activity() {
  const { data: events = [], isLoading, isError } = useQuery<ActivityEvent[]>({
    queryKey: ["activity-all"],
    queryFn: () => api.get("/activity?limit=100").then(r => r.data),
  });

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-muted-foreground mt-1">
          All compliance activities and system events for your organization
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Events</CardTitle>
          <CardDescription>{events.length} events recorded</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">Loading activity...</p>
          )}
          {isError && (
            <p className="text-sm text-destructive text-center py-8">Failed to load activity. Please refresh.</p>
          )}
          {!isLoading && events.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No activity yet. Upload a document or run an analysis to get started.
            </p>
          )}
          <div className="divide-y divide-border">
            {events.map((event) => {
              const cfg = ACTION_CONFIG[event.action] ?? DEFAULT_ACTION;
              const sev = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.info;
              const Icon = cfg.icon;
              return (
                <div key={event.id} className="flex gap-4 py-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted ${cfg.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${sev.className}`}>
                        {sev.label}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(event.created_at)}
                      </span>
                      {event.actor_email && (
                        <span className="font-mono">{event.actor_email}</span>
                      )}
                      {event.resource_type && (
                        <span className="capitalize">{event.resource_type}</span>
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
  );
}
