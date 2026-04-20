import { Upload, BarChart3, Shield, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const actions = [
  {
    title: "Upload Document",
    description: "Add new documents for compliance analysis",
    icon: Upload,
    variant: "default" as const,
    href: "/upload"
  },
  {
    title: "View Reports",
    description: "Access detailed compliance reports",
    icon: BarChart3,
    variant: "outline" as const,
    href: "/reports"
  },
  {
    title: "Manage Rules",
    description: "Configure compliance rules and settings",
    icon: Shield,
    variant: "outline" as const,
    href: "/rules"
  },
  {
    title: "Browse Documents",
    description: "View and manage document library",
    icon: FileText,
    variant: "outline" as const,
    href: "/documents"
  }
];

export function QuickActions() {
  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>
          Common tasks and navigation shortcuts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.title}
                variant={action.variant}
                className={`h-auto min-h-[90px] p-4 justify-start text-left interactive animate-scale-in ${
                  action.variant === "default" ? "gradient-primary animate-glow" : ""
                }`}
                style={{ animationDelay: `${index * 150}ms` }}
                asChild
              >
                <a href={action.href} className="w-full block">
                  <div className="flex items-start gap-3 w-full overflow-hidden">
                    <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="font-medium truncate mb-1">{action.title}</div>
                      <div 
                        className="text-xs opacity-70 leading-4"
                        style={{
                          wordWrap: 'break-word',
                          overflowWrap: 'break-word',
                          hyphens: 'auto',
                          whiteSpace: 'normal'
                        }}
                      >
                        {action.description}
                      </div>
                    </div>
                  </div>
                </a>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}