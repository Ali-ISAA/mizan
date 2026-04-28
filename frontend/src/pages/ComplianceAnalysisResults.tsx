import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Clause {
  id: string;
  name: string;
  status: 'compliant' | 'gap' | 'conflict' | 'missing';
  confidence: number;
  summary?: string;
}

interface AnalysisData {
  document: {
    name: string;
    type: string;
    size: string;
    uploaded?: string;
  };
  overview: {
    compliance_score: number;
    total_clauses: number;
    issues_found: number;
    compliant_clauses?: number;
    needs_review?: number;
    critical_issues?: number;
  };
  clauses: Clause[];
}

interface ComplianceAnalysisResultsProps {
  data: AnalysisData;
}

export function ComplianceAnalysisResults({ data }: ComplianceAnalysisResultsProps) {
  const navigate = useNavigate();

  const statusColor = {
    compliant: 'bg-success/10 text-success',
    gap: 'bg-warning/10 text-warning',
    conflict: 'bg-critical/10 text-critical',
    missing: 'bg-critical/10 text-critical',
  };

  const scoreColor =
    data.overview.compliance_score >= 80
      ? 'text-success'
      : data.overview.compliance_score >= 60
        ? 'text-warning'
        : 'text-critical';

  const scoreEmoji =
    data.overview.compliance_score >= 80 ? '🟢' : data.overview.compliance_score >= 60 ? '🟡' : '🔴';

  return (
    <div className="flex-1 flex flex-col h-screen bg-background">
      <div className="flex-1 overflow-auto flex flex-col p-6 space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate('/documents')}
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-foreground w-fit mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Documents
          </button>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{data.document.name}</h1>
              <p className="text-sm text-text-secondary mt-1">Detailed compliance analysis and clause breakdown</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download Report
              </Button>
              <Button size="sm">
                <MessageSquare className="h-4 w-4 mr-2" />
                Ask AI Assistant
              </Button>
            </div>
          </div>
        </div>

        {/* Overview Section */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Document Overview</CardTitle>
            <CardDescription>Compliance analysis summary for {data.document.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-5xl font-bold ${scoreColor}`}>
                  {scoreEmoji} {data.overview.compliance_score}%
                </p>
                <p className="text-sm text-text-secondary mt-2">Overall Score</p>
              </div>
              <div className="grid grid-cols-3 gap-8">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{data.overview.total_clauses}</p>
                  <p className="text-xs text-text-secondary">Total Clauses</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-critical">{data.overview.issues_found}</p>
                  <p className="text-xs text-text-secondary">Issues Found</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-success">{data.overview.compliant_clauses || 0}</p>
                  <p className="text-xs text-text-secondary">Compliant</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Document Info */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Document Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">File:</span>
              <span className="text-sm font-medium">{data.document.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Type:</span>
              <span className="text-sm font-medium">{data.document.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Size:</span>
              <span className="text-sm font-medium">{data.document.size}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Status:</span>
              <Badge className="bg-success/10 text-success">Compliant</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Clause-by-Clause Analysis */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Clause-by-Clause Analysis</CardTitle>
            <CardDescription>Detailed breakdown of each clause and its compliance status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.clauses.map((clause) => (
              <div key={clause.id} className="border-b border-border pb-4 last:border-b-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground">{clause.name}</h4>
                    <p className="text-sm text-text-secondary mt-1">Confidence: {clause.confidence}%</p>
                    {clause.summary && <p className="text-sm mt-2">{clause.summary}</p>}
                  </div>
                  <Badge className={statusColor[clause.status]}>{clause.status}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
