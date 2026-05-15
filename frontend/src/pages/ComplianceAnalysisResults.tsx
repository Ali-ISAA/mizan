import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Download, MessageSquare,
  ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, XCircle, Minus, FileText, RotateCcw, Loader2, ShieldAlert, FileText as FileTextIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface Clause {
  id: string;
  name: string;
  doc_b_section?: string;
  status: 'compliant' | 'gap' | 'conflict' | 'missing' | 'not_applicable';
  severity?: 'critical' | 'medium' | 'low' | 'none';
  confidence: number;
  summary?: string;
  recommendation?: string;
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

interface Narrative {
  executive_summary: string;
  risk_assessment: string;
}

interface ComplianceAnalysisResultsProps {
  data: AnalysisData;
  narrative?: Narrative | null;
  narrativeLoading?: boolean;
  onReanalyze?: () => void;
  isReanalyzing?: boolean;
}

const STATUS_CONFIG = {
  compliant:       { Icon: CheckCircle2, color: 'text-success',        bg: 'bg-success/10',        label: 'Compliant' },
  gap:             { Icon: AlertTriangle, color: 'text-warning',        bg: 'bg-warning/10',        label: 'Gap' },
  conflict:        { Icon: XCircle,       color: 'text-critical',       bg: 'bg-critical/10',       label: 'Conflict' },
  missing:         { Icon: XCircle,       color: 'text-critical',       bg: 'bg-critical/10',       label: 'Missing' },
  not_applicable:  { Icon: Minus,         color: 'text-text-secondary', bg: 'bg-surface',           label: 'N/A' },
} as const;

function truncate(text: string, max = 80) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function ClauseCard({ clause }: { clause: Clause }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[clause.status];
  const { Icon } = cfg;

  // doc_b_section stores regulation references separated by "\n\n"
  const regulationRefs = clause.doc_b_section
    ? clause.doc_b_section.split('\n\n').map(r => r.trim()).filter(Boolean)
    : [];

  return (
    <div className="border-b border-border pb-4 last:border-b-0 last:pb-0">
      <button className="w-full text-left" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${cfg.color}`} />
            <div className="min-w-0">
              {/* Show "Chunk X" as the primary label, not raw text */}
              <h4 className="font-semibold text-foreground text-sm">{clause.name}</h4>
              <p className="text-xs text-text-secondary mt-0.5">Confidence: {clause.confidence}%</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={`${cfg.bg} ${cfg.color} border-0 text-xs`}>{cfg.label}</Badge>
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5 text-text-secondary" />
              : <ChevronDown className="h-3.5 w-3.5 text-text-secondary" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 ml-8 space-y-2">
          {clause.summary && clause.summary !== 'Fully compliant' && (
            <div className="bg-surface rounded p-3">
              <p className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-1">Issue</p>
              <p className="text-sm text-foreground">{clause.summary}</p>
            </div>
          )}

          {regulationRefs.length > 0 && (
            <div className="bg-surface rounded p-3">
              <p className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-2">
                Regulation References ({regulationRefs.length})
              </p>
              <div className="space-y-2">
                {regulationRefs.map((ref, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-xs text-accent-600 font-bold shrink-0 mt-0.5">#{idx + 1}</span>
                    <p className="text-sm text-foreground">{ref}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {clause.recommendation && clause.recommendation !== 'No action required' && (
            <div className="bg-accent-600/5 border border-accent-600/20 rounded p-3">
              <p className="text-xs text-accent-600 font-medium uppercase tracking-wider mb-1">Recommendation</p>
              <p className="text-sm text-foreground">{clause.recommendation}</p>
            </div>
          )}

          {clause.status === 'compliant' && regulationRefs.length === 0 && (
            <p className="text-sm text-success">Fully compliant — no issues found.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ComplianceAnalysisResults({ data, narrative, narrativeLoading, onReanalyze, isReanalyzing }: ComplianceAnalysisResultsProps) {
  const navigate = useNavigate();

  const scoreColor =
    data.overview.compliance_score >= 80 ? 'text-success'
    : data.overview.compliance_score >= 60 ? 'text-warning'
    : 'text-critical';

  const total = data.overview.total_clauses || 1;
  const compliantCount = data.overview.compliant_clauses ?? data.clauses.filter(c => c.status === 'compliant').length;
  const needsReviewCount = data.overview.needs_review ?? data.clauses.filter(c => c.status === 'gap').length;
  const criticalCount = data.overview.critical_issues ?? data.clauses.filter(c => c.status === 'conflict' || c.status === 'missing').length;

  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;

  // Exclude not_applicable from the displayed list — they're informational noise
  const displayedClauses = data.clauses.filter(c => c.status !== 'not_applicable');
  const nonCompliantWithRecs = displayedClauses.filter(c => c.status !== 'compliant' && c.recommendation);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/documents')}
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Documents
        </button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{data.document.name}</h1>
            <p className="text-sm text-text-secondary mt-1">Compliance Analysis Report</p>
          </div>
          <div className="flex items-center gap-2">
            {onReanalyze && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReanalyze}
                disabled={isReanalyzing}
              >
                <RotateCcw className={`h-4 w-4 mr-2 ${isReanalyzing ? 'animate-spin' : ''}`} />
                {isReanalyzing ? 'Starting…' : 'Re-analyze'}
              </Button>
            )}
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download Report
            </Button>
          </div>
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-3 gap-6 items-start">

        {/* LEFT — main content (2/3 width) */}
        <div className="col-span-2 space-y-6">

          {/* Overview card */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Document Overview</CardTitle>
              <p className="text-sm text-text-secondary">Compliance analysis summary for {data.document.name}</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start gap-10">
                <div>
                  <p className={`text-5xl font-bold ${scoreColor}`}>{data.overview.compliance_score}%</p>
                  <p className="text-xs text-text-secondary mt-1">Overall Score</p>
                </div>
                <div className="grid grid-cols-3 gap-6 flex-1">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground">{data.overview.total_clauses}</p>
                    <p className="text-xs text-text-secondary mt-1">Total Clauses</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-critical">{data.overview.issues_found}</p>
                    <p className="text-xs text-text-secondary mt-1">Issues Found</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-success">{compliantCount}</p>
                    <p className="text-xs text-text-secondary mt-1">Compliant</p>
                  </div>
                </div>
              </div>

              {/* Progress bars */}
              <div className="space-y-3">
                {[
                  { label: 'Compliant Clauses', count: compliantCount, color: 'bg-success' },
                  { label: 'Needs Review',       count: needsReviewCount, color: 'bg-warning' },
                  { label: 'Critical Issues',    count: criticalCount,    color: 'bg-critical' },
                ].map(({ label, count, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-sm text-text-secondary w-36 shrink-0">{label}</span>
                    <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: pct(count) }} />
                    </div>
                    <span className="text-sm font-medium w-5 text-right text-text-secondary">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI Narrative Report */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Compliance Report</CardTitle>
              <p className="text-sm text-text-secondary">AI-generated executive summary and risk assessment</p>
            </CardHeader>
            <CardContent className="space-y-5">
              {narrativeLoading ? (
                <div className="flex items-center gap-3 py-4 text-text-secondary">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <p className="text-sm">Generating report narrative…</p>
                </div>
              ) : narrative ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileTextIcon className="h-4 w-4 text-accent-600 shrink-0" />
                      <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">Executive Summary</h4>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed pl-6">{narrative.executive_summary}</p>
                  </div>
                  <div className="border-t border-border pt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-warning shrink-0" />
                      <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">Risk Assessment</h4>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed pl-6">{narrative.risk_assessment}</p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-text-secondary py-2">Narrative unavailable.</p>
              )}
            </CardContent>
          </Card>

          {/* Clause-by-clause */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Clause-by-Clause Analysis</CardTitle>
              <p className="text-sm text-text-secondary">
                Click any clause to see the issue, reference section, and recommendation
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {displayedClauses.length === 0
                ? <p className="text-sm text-text-secondary text-center py-4">No findings available</p>
                : displayedClauses.map(clause => <ClauseCard key={clause.id} clause={clause} />)
              }
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — sidebar (1/3 width), sticky so it stays while scrolling */}
        <div className="col-span-1 space-y-4 sticky top-6">

          {/* Document info */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Document Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-text-secondary shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{data.document.name}</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Type:</span>
                  <Badge variant="outline" className="text-xs">{data.document.type}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Status:</span>
                  <Badge className={
                    data.overview.issues_found === 0
                      ? 'bg-success/10 text-success border-0'
                      : 'bg-warning/10 text-warning border-0'
                  }>
                    {data.overview.issues_found === 0 ? 'Compliant' : 'Issues Found'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Size:</span>
                  <span className="font-medium">{data.document.size}</span>
                </div>
                {data.document.uploaded && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Uploaded:</span>
                    <span className="font-medium">{data.document.uploaded}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* AI Assistant */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-accent-600" />
                <CardTitle className="text-sm">AI Compliance Assistant</CardTitle>
              </div>
              <p className="text-xs text-text-secondary">Get instant answers about this document's compliance</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-text-secondary font-medium">Ask me about:</p>
              <ul className="space-y-1.5">
                {['Compliance issues and fixes', 'Legal requirements', 'Risk assessment', 'Improvement suggestions'].map(item => (
                  <li key={item} className="text-xs text-foreground flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-accent-600 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button className="w-full gap-2" size="sm">
                <MessageSquare className="h-3.5 w-3.5" />
                Start Chat
              </Button>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recommendations</CardTitle>
              <p className="text-xs text-text-secondary">Top suggested improvements</p>
            </CardHeader>
            <CardContent>
              {data.overview.issues_found === 0 ? (
                <p className="text-sm text-success font-medium">No immediate action required.</p>
              ) : (
                <div className="space-y-3">
                  {nonCompliantWithRecs.slice(0, 3).map(c => (
                    <div key={c.id} className="text-xs border-l-2 border-warning pl-2">
                      <p className="font-medium text-foreground">{truncate(c.name, 50)}</p>
                      <p className="text-text-secondary mt-0.5 line-clamp-2">{c.recommendation}</p>
                    </div>
                  ))}
                  {nonCompliantWithRecs.length > 3 && (
                    <p className="text-xs text-text-secondary text-center">
                      +{nonCompliantWithRecs.length - 3} more
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
