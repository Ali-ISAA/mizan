import { Clock, FileText, Shield, AlertTriangle, CheckCircle, LogIn } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";

interface ActivityEvent {
  id: string;
  action: string;
  severity: string;
  title: string;
  description: string | null;
  actor_email: string | null;
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
  success: { label: "Success", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  warning: { label: "Warning", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  error:   { label: "Error",   className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  info:    { label: "Info",    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
};

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function ActivityTimeline() {
  const { data: events = [], isLoading } = useQuery<ActivityEvent[]>({
    queryKey: ["activity-recent"],
    queryFn: () => api.get("/activity?limit=5").then(r => r.data),
    refetchInterval: 30_000,
  });

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest compliance checks and system updates</CardDescription>
        </div>
        <Link to="/activity" className="text-xs text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        )}
        {!isLoading && events.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
        )}
        <div className="space-y-4">
          {events.map((event, index) => {
            const cfg = ACTION_CONFIG[event.action] ?? DEFAULT_ACTION;
            const sev = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.info;
            const Icon = cfg.icon;
            return (
              <div
                key={event.id}
                className="flex gap-4 pb-4 border-b border-border last:border-0 last:pb-0 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface ${cfg.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{event.title}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sev.className}`}>
                      {sev.label}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {timeAgo(event.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
