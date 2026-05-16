import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, TrendingUp, AlertTriangle, CheckCircle, FileText, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart as RechartsPieChart, Cell, AreaChart, Area, Pie,
} from "recharts";
import { api } from "@/lib/api";

interface AnalyticsData {
  overview: {
    avg_score: number;
    total_documents: number;
    total_comparisons: number;
    active_issues: number;
    critical_issues: number;
    medium_issues: number;
  };
  compliance_trend: { month: string; score: number; comparisons: number }[];
  risk_distribution: { name: string; value: number; color: string }[];
  severity_distribution: { name: string; value: number; color: string }[];
  top_issues: { issue: string; severity: string; count: number }[];
  documents: {
    name: string; score: number; issues: number; critical: number;
    medium: number; regulation: string; completed_at: string | null;
  }[];
  regulation_breakdown: {
    regulation: string; avg_score: number; doc_count: number;
    total_issues: number; critical_total: number;
  }[];
}

function scoreColor(score: number) {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-critical";
}

function severityBadge(severity: string) {
  switch (severity) {
    case "critical": return "bg-critical/10 text-critical border-0";
    case "medium":   return "bg-warning/10 text-warning border-0";
    default:         return "bg-success/10 text-success border-0";
  }
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
};

export default function Reports() {
  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["analytics"],
    queryFn: () => api.get<AnalyticsData>("/analytics").then((r) => r.data),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <p className="text-text-secondary">Loading analytics…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <p className="text-critical">Failed to load analytics data.</p>
      </div>
    );
  }

  const { overview, compliance_trend, risk_distribution, severity_distribution, top_issues, documents, regulation_breakdown } = data;

  return (
    <div className="flex-1 space-y-6 p-8">
      {/* Header */}
      <div className="border-b border-border pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Reports & Analytics</h1>
          <p className="text-text-secondary mt-1">Comprehensive compliance insights for your organization.</p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="compliance">Compliance Trends</TabsTrigger>
          <TabsTrigger value="risks">Risk Analysis</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="regulations">Regulation Breakdown</TabsTrigger>
        </TabsList>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          {/* KPI cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="card-elevated">
              <CardContent className="p-6 flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-success shrink-0" />
                <div>
                  <p className="text-xs text-text-secondary">Avg Compliance Score</p>
                  <p className={`text-2xl font-bold ${scoreColor(overview.avg_score)}`}>{overview.avg_score}%</p>
                  <p className="text-xs text-text-secondary">{overview.total_comparisons} analyses run</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated">
              <CardContent className="p-6 flex items-center gap-3">
                <FileText className="h-8 w-8 text-accent-600 shrink-0" />
                <div>
                  <p className="text-xs text-text-secondary">Documents Analyzed</p>
                  <p className="text-2xl font-bold text-foreground">{overview.total_documents}</p>
                  <p className="text-xs text-text-secondary">{overview.total_comparisons} total comparisons</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated">
              <CardContent className="p-6 flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-warning shrink-0" />
                <div>
                  <p className="text-xs text-text-secondary">Active Issues</p>
                  <p className="text-2xl font-bold text-warning">{overview.active_issues}</p>
                  <p className="text-xs text-text-secondary">{overview.medium_issues} medium</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated">
              <CardContent className="p-6 flex items-center gap-3">
                <ShieldAlert className="h-8 w-8 text-critical shrink-0" />
                <div>
                  <p className="text-xs text-text-secondary">Critical Issues</p>
                  <p className="text-2xl font-bold text-critical">{overview.critical_issues}</p>
                  <p className="text-xs text-text-secondary">Require immediate action</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Compliance Score Trend</CardTitle>
                <CardDescription>Average score by month</CardDescription>
              </CardHeader>
              <CardContent>
                {compliance_trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={compliance_trend}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} name="Avg Score" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-text-secondary py-8 text-center">No trend data yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Risk Distribution</CardTitle>
                <CardDescription>Findings breakdown by status</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <RechartsPieChart>
                    <Pie data={risk_distribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value">
                      {risk_distribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {risk_distribution.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-foreground">{item.name}: {item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Issues */}
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Compliance Issues</CardTitle>
              <CardDescription>Most frequent issues across all analyzed documents</CardDescription>
            </CardHeader>
            <CardContent>
              {top_issues.length === 0 ? (
                <p className="text-sm text-text-secondary text-center py-4">No issues found.</p>
              ) : (
                <div className="space-y-3">
                  {top_issues.map((issue, i) => (
                    <div key={i} className="flex items-start justify-between gap-4 p-3 rounded-lg bg-surface">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-snug">{issue.issue}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={severityBadge(issue.severity)}>{issue.severity}</Badge>
                        <span className="text-sm font-bold text-foreground w-5 text-right">{issue.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Compliance Trends ────────────────────────────────────────────── */}
        <TabsContent value="compliance" className="space-y-6">
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Compliance Score Over Time</CardTitle>
              <CardDescription>Average score and number of comparisons per month</CardDescription>
            </CardHeader>
            <CardContent>
              {compliance_trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart data={compliance_trend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line yAxisId="left" type="monotone" dataKey="score" stroke="#3b82f6" name="Avg Score (%)" strokeWidth={2} dot />
                    <Line yAxisId="right" type="monotone" dataKey="comparisons" stroke="#10b981" name="Comparisons" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-text-secondary text-center py-16">Run analyses to see trend data.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Risk Analysis ─────────────────────────────────────────────────── */}
        <TabsContent value="risks" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Severity Breakdown</CardTitle>
                <CardDescription>Issues by severity across all analyses</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={severity_distribution} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: 'hsl(var(--text-secondary))' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--text-secondary))' }} width={60} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" radius={4} name="Findings" background={false}>
                      {severity_distribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Finding Status Breakdown</CardTitle>
                <CardDescription>Status distribution across all findings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 pt-2">
                  {risk_distribution.map((item) => {
                    const total = risk_distribution.reduce((s, r) => s + r.value, 0) || 1;
                    return (
                      <div key={item.name} className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-foreground">{item.name}</span>
                          <span className="font-medium text-foreground">{item.value} <span className="text-text-secondary font-normal">({Math.round(item.value / total * 100)}%)</span></span>
                        </div>
                        <div className="h-2 bg-surface rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.round(item.value / total * 100)}%`, backgroundColor: item.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Issues Requiring Action</CardTitle>
              <CardDescription>Recurring compliance gaps sorted by frequency</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {top_issues.slice(0, 5).map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-surface">
                    <span className="text-xs font-bold text-text-secondary mt-0.5 w-4 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">{issue.issue}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={severityBadge(issue.severity)}>{issue.severity}</Badge>
                      <span className="text-xs text-text-secondary">×{issue.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Documents ─────────────────────────────────────────────────────── */}
        <TabsContent value="documents" className="space-y-6">
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Document Compliance Scores</CardTitle>
              <CardDescription>Latest analysis result per document</CardDescription>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-text-secondary text-center py-8">No documents analyzed yet.</p>
              ) : (
                <div className="space-y-4">
                  {documents.map((doc, i) => (
                    <div key={i} className="space-y-2 pb-4 border-b border-border last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-foreground truncate">{doc.name}</p>
                          <p className="text-xs text-text-secondary mt-0.5">{doc.regulation} · {doc.issues} issues ({doc.critical} critical)</p>
                        </div>
                        <span className={`text-2xl font-bold shrink-0 ${scoreColor(doc.score)}`}>{doc.score}%</span>
                      </div>
                      <div className="h-2 bg-surface rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${doc.score}%`,
                            backgroundColor: doc.score >= 80 ? "#10b981" : doc.score >= 60 ? "#f59e0b" : "#ef4444",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {documents.length > 0 && (
            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Score Comparison</CardTitle>
                <CardDescription>Side-by-side compliance score per document</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(200, documents.length * 48)}>
                  <BarChart data={documents} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--text-secondary))' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} width={180} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, "Score"]} />
                    <Bar dataKey="score" radius={4} name="Score" background={false}>
                      {documents.map((doc, i) => (
                        <Cell key={i} fill={doc.score >= 80 ? "#10b981" : doc.score >= 60 ? "#f59e0b" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Regulation Breakdown ─────────────────────────────────────────── */}
        <TabsContent value="regulations" className="space-y-6">
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Compliance by Regulation</CardTitle>
              <CardDescription>How your documents score against each regulation</CardDescription>
            </CardHeader>
            <CardContent>
              {regulation_breakdown.length === 0 ? (
                <p className="text-sm text-text-secondary text-center py-8">No regulation data yet.</p>
              ) : (
                <div className="space-y-6">
                  {regulation_breakdown.map((reg, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-sm text-foreground">{reg.regulation}</p>
                          <p className="text-xs text-text-secondary">
                            {reg.doc_count} document{reg.doc_count !== 1 ? "s" : ""} · {reg.total_issues} issues · {reg.critical_total} critical
                          </p>
                        </div>
                        <span className={`text-2xl font-bold shrink-0 ${scoreColor(reg.avg_score)}`}>{reg.avg_score}%</span>
                      </div>
                      <Progress value={reg.avg_score} className="h-2" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
