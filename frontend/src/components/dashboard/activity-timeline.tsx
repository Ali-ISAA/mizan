import { Clock, FileText, Shield, AlertTriangle, CheckCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const activities = [
  {
    id: 1,
    type: "upload" as const,
    title: "Document uploaded",
    description: "Employment_Contract_v2.pdf was uploaded and analyzed",
    timestamp: "15 minutes ago",
    status: "success"
  },
  {
    id: 2,
    type: "compliance" as const,
    title: "Compliance check completed",
    description: "Privacy_Policy_Updated.docx analysis finished with warnings",
    timestamp: "2 hours ago",
    status: "warning"
  },
  {
    id: 3,
    type: "rule" as const,
    title: "Compliance rule updated",
    description: "GDPR Article 6 requirements were modified",
    timestamp: "1 day ago",
    status: "info"
  },
  {
    id: 4,
    type: "alert" as const,
    title: "Critical issue detected",
    description: "Data_Processing_Terms.pdf contains non-compliant clauses",
    timestamp: "2 days ago",
    status: "error"
  },
  {
    id: 5,
    type: "upload" as const,
    title: "Batch upload completed",
    description: "5 policy documents were processed successfully",
    timestamp: "3 days ago",
    status: "success"
  }
];

const typeConfig = {
  upload: { icon: FileText, color: "text-primary" },
  compliance: { icon: Shield, color: "text-success" },
  rule: { icon: Shield, color: "text-muted" },
  alert: { icon: AlertTriangle, color: "text-destructive" }
};

const statusConfig = {
  success: { color: "bg-success", label: "Success" },
  warning: { color: "bg-warning", label: "Warning" },
  info: { color: "bg-secondary", label: "Info" },
  error: { color: "bg-destructive", label: "Error" }
};

export function ActivityTimeline() {
  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>
          Latest compliance checks and system updates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity, index) => {
            const typeInfo = typeConfig[activity.type];
            const statusInfo = statusConfig[activity.status as keyof typeof statusConfig];
            const TypeIcon = typeInfo.icon;
            
            return (
              <div 
                key={activity.id} 
                className="flex gap-4 pb-4 border-b border-border last:border-0 last:pb-0 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface ${typeInfo.color}`}>
                  <TypeIcon className="h-4 w-4" />
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{activity.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {statusInfo.label}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{activity.description}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {activity.timestamp}
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