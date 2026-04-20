import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Share2, RefreshCw, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const analysisResults = {
  1: {
    projectName: "GDPR Compliance Project",
    overallScore: 94,
    status: "compliant" as const,
    analysisDate: "2024-01-15",
    gaps: [
      { id: 1, requirement: "Data Processing Agreement", status: "compliant", severity: "info", details: "All requirements met" },
      { id: 2, requirement: "Privacy Impact Assessment", status: "compliant", severity: "info", details: "Properly implemented" }
    ],
    recommendations: [
      { id: 1, title: "Update Data Retention Policy", priority: "medium", description: "Current policy needs update for GDPR 2.4.2" },
      { id: 2, title: "Implement Audit Logging", priority: "high", description: "Add comprehensive logging for data access" }
    ]
  },
  2: {
    projectName: "ISO 27001 Assessment",
    overallScore: 78,
    status: "warning" as const,
    analysisDate: "2024-01-14",
    gaps: [
      { id: 3, requirement: "Access Control Policy", status: "partial", severity: "warning", details: "Missing specific sections" },
      { id: 4, requirement: "Incident Response Plan", status: "missing", severity: "critical", details: "Not documented" }
    ],
    recommendations: [
      { id: 3, title: "Complete Access Control Policy", priority: "high", description: "Add role-based access control details" },
      { id: 4, title: "Develop Incident Response Plan", priority: "critical", description: "Create comprehensive incident response procedures" }
    ]
  }
};

export default function AnalysisResults() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const results = analysisResults[projectId as keyof typeof analysisResults] || analysisResults[1];

  const statusColor = {
    compliant: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    critical: "bg-destructive/10 text-destructive",
    partial: "bg-warning/10 text-warning"
  };

  const severityConfig = {
    info: { icon: CheckCircle, color: "text-info" },
    warning: { icon: AlertTriangle, color: "text-warning" },
    critical: { icon: XCircle, color: "text-destructive" }
  };

  const priorityColor = {
    low: "bg-info/10 text-info",
    medium: "bg-warning/10 text-warning",
    high: "bg-destructive/10 text-destructive",
    critical: "bg-destructive/10 text-destructive"
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Project
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Reanalyze
          </Button>
          <Button variant="outline" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button className="gap-2">
            <Download className="h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Overview Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{results.projectName}</CardTitle>
              <CardDescription>Analysis Results</CardDescription>
            </div>
            <Badge className={statusColor[results.status as keyof typeof statusColor]}>
              {results.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Overall Score</p>
              <div className="flex items-end gap-3">
                <div className="text-4xl font-bold text-success">{results.overallScore}%</div>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Total Requirements</p>
              <p className="text-4xl font-bold">{results.gaps.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Compliant</p>
              <p className="text-4xl font-bold text-success">
                {results.gaps.filter(g => g.status === "compliant").length}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Issues</p>
              <p className="text-4xl font-bold text-warning">
                {results.gaps.filter(g => g.status !== "compliant").length}
              </p>
            </div>
          </div>

          <div className="w-full h-3 bg-accent rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-success to-success/80"
              style={{ width: `${results.overallScore}%` }}
            />
          </div>

          <p className="text-sm text-muted-foreground">
            Last analyzed: {new Date(results.analysisDate).toLocaleString()}
          </p>
        </CardContent>
      </Card>

      {/* Detailed Analysis Tabs */}
      <Tabs defaultValue="gaps" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="gaps">Requirement Gaps</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="gaps" className="space-y-4">
          {results.gaps.map((gap) => {
            const SeverityIcon = severityConfig[gap.severity as keyof typeof severityConfig].icon;
            const severityColor = severityConfig[gap.severity as keyof typeof severityConfig].color;

            return (
              <Card key={gap.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <SeverityIcon className={`h-5 w-5 mt-1 flex-shrink-0 ${severityColor}`} />
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{gap.requirement}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{gap.details}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize flex-shrink-0">
                      {gap.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          {results.recommendations.map((rec) => (
            <Card key={rec.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{rec.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
                  </div>
                  <Badge className={priorityColor[rec.priority as keyof typeof priorityColor]} >
                    {rec.priority}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
