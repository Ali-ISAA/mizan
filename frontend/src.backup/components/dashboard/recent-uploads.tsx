import { FileText, Clock, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const uploads = [
  {
    id: 1,
    name: "Employment_Contract_v2.pdf",
    type: "Contract",
    status: "compliant" as const,
    uploadedAt: "2 hours ago",
    score: 94
  },
  {
    id: 2,
    name: "Privacy_Policy_Updated.docx",
    type: "Policy",
    status: "warning" as const,
    uploadedAt: "5 hours ago",
    score: 78
  },
  {
    id: 3,
    name: "Vendor_Agreement_2024.pdf",
    type: "Agreement",
    status: "processing" as const,
    uploadedAt: "1 day ago",
    score: null
  },
  {
    id: 4,
    name: "Data_Processing_Terms.pdf",
    type: "Legal Doc",
    status: "critical" as const,
    uploadedAt: "2 days ago",
    score: 52
  },
  {
    id: 5,
    name: "Employee_Handbook_2024.pdf",
    type: "Policy",
    status: "compliant" as const,
    uploadedAt: "3 days ago",
    score: 89
  }
];

const statusConfig = {
  compliant: {
    icon: CheckCircle,
    className: "badge-compliant",
    label: "Compliant"
  },
  warning: {
    icon: AlertTriangle,
    className: "badge-warning",
    label: "Needs Review"
  },
  critical: {
    icon: XCircle,
    className: "badge-critical",
    label: "Critical Issues"
  },
  processing: {
    icon: Clock,
    className: "bg-secondary text-secondary-foreground",
    label: "Processing"
  }
};

export function RecentUploads() {
  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle>Recent Uploads</CardTitle>
        <CardDescription>
          Latest documents uploaded for compliance checking
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {uploads.map((upload, index) => {
            const statusInfo = statusConfig[upload.status];
            const StatusIcon = statusInfo.icon;
            
            return (
              <div 
                key={upload.id} 
                className="flex items-center justify-between p-3 rounded-lg bg-surface hover:bg-surface-hover interactive animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{upload.name}</p>
                    <p className="text-xs text-muted-foreground">{upload.type} • {upload.uploadedAt}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {upload.score && (
                    <div className="text-right">
                      <p className="text-sm font-medium">{upload.score}%</p>
                      <p className="text-xs text-muted-foreground">Score</p>
                    </div>
                  )}
                  <Badge className={`${statusInfo.className} flex items-center gap-1`}>
                    <StatusIcon className="h-3 w-3" />
                    {statusInfo.label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}