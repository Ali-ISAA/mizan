import { FileText, Shield, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const stats = [
  {
    title: "Total Documents",
    value: "1,248",
    change: "+12%",
    changeType: "positive" as const,
    icon: FileText,
    color: "accent-600" as const,
    description: "Documents processed this month"
  },
  {
    title: "Compliance Score",
    value: "87%",
    change: "+3%",
    changeType: "positive" as const,
    icon: Shield,
    color: "success" as const,
    description: "Overall compliance rating"
  },
  {
    title: "Pending Reviews",
    value: "23",
    change: "-8",
    changeType: "positive" as const,
    icon: AlertTriangle,
    color: "warning" as const,
    description: "Documents awaiting review"
  },
  {
    title: "Critical Issues",
    value: "4",
    change: "-2",
    changeType: "positive" as const,
    icon: Shield,
    color: "critical" as const,
    description: "High-priority compliance issues"
  }
];

const colorClasses = {
  "accent-600": "bg-accent-600/10 text-accent-600",
  "success": "bg-success/10 text-success",
  "warning": "bg-warning/10 text-warning",
  "critical": "bg-critical/10 text-critical",
};

export function StatsCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <Card
          key={stat.title}
          className="group relative overflow-hidden border-border bg-surface-elevated hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in"
          style={{ animationDelay: `${index * 75}ms` }}
        >
          {/* Gradient overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-br from-accent-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                {stat.title}
              </p>
            </div>
            <div className={`
              flex h-10 w-10 items-center justify-center rounded-lg
              transition-all duration-300 group-hover:scale-110
              ${colorClasses[stat.color]}
            `}>
              <stat.icon className="h-5 w-5" />
            </div>
          </CardHeader>

          <CardContent className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">
                {stat.value}
              </span>
              <div className="flex items-center gap-1 text-xs font-medium">
                {stat.changeType === 'positive' ? (
                  <>
                    <TrendingUp className="h-3 w-3 text-success" />
                    <span className="text-success">{stat.change}</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-3 w-3 text-critical" />
                    <span className="text-critical">{stat.change}</span>
                  </>
                )}
              </div>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              {stat.description}
            </p>
          </CardContent>

          {/* Bottom accent bar */}
          <div className={`
            absolute bottom-0 left-0 right-0 h-1
            opacity-0 group-hover:opacity-100 transition-opacity duration-300
            ${stat.color === 'accent-600' && 'bg-accent-600'}
            ${stat.color === 'success' && 'bg-success'}
            ${stat.color === 'warning' && 'bg-warning'}
            ${stat.color === 'critical' && 'bg-critical'}
          `} />
        </Card>
      ))}
    </div>
  );
}
