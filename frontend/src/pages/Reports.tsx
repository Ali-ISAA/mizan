import { useState } from "react";
import { BarChart3, Download, Filter, Calendar, TrendingUp, AlertTriangle, CheckCircle, PieChart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart as RechartsPieChart, Cell, Area, AreaChart, Pie } from 'recharts';

const complianceData = [
  { month: 'Jan', score: 75, documents: 45, issues: 12 },
  { month: 'Feb', score: 78, documents: 52, issues: 10 },
  { month: 'Mar', score: 82, documents: 48, issues: 8 },
  { month: 'Apr', score: 85, documents: 61, issues: 6 },
  { month: 'May', score: 88, documents: 58, issues: 4 },
  { month: 'Jun', score: 87, documents: 63, issues: 5 },
];

const riskDistribution = [
  { name: 'Low Risk', value: 65, color: '#10b981' },
  { name: 'Medium Risk', value: 25, color: '#f59e0b' },
  { name: 'High Risk', value: 8, color: '#ef4444' },
  { name: 'Critical Risk', value: 2, color: '#dc2626' }
];

const frameworkCompliance = [
  { framework: 'GDPR', compliance: 92, documents: 28, issues: 2 },
  { framework: 'SOX', compliance: 88, documents: 15, issues: 3 },
  { framework: 'CCPA', compliance: 85, documents: 12, issues: 2 },
  { framework: 'HIPAA', compliance: 78, documents: 8, issues: 4 },
  { framework: 'PCI DSS', compliance: 95, documents: 6, issues: 1 }
];

const topIssues = [
  { issue: 'Missing data retention clauses', count: 15, severity: 'high' },
  { issue: 'Vague consent language', count: 12, severity: 'medium' },
  { issue: 'Insufficient data sharing disclosure', count: 10, severity: 'critical' },
  { issue: 'Missing termination procedures', count: 8, severity: 'medium' },
  { issue: 'Unclear data subject rights', count: 6, severity: 'high' }
];

const Reports = () => {
  const [dateRange, setDateRange] = useState({
    from: new Date(2024, 0, 1),
    to: new Date()
  });
  const [framework, setFramework] = useState("all");
  const [documentType, setDocumentType] = useState("all");

  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#dc2626'];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'badge-critical';
      case 'high': return 'badge-warning';
      case 'medium': return 'bg-secondary text-secondary-foreground';
      default: return 'badge-compliant';
    }
  };

  return (
    <div className="flex-1 space-y-8 p-8 animate-fade-in">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Reports & Analytics</h1>
            <p className="text-text-secondary mt-2 text-base">
              Comprehensive compliance insights and analytics for your organization.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button>
              <BarChart3 className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Report Filters
          </CardTitle>
          <CardDescription>
            Customize your analytics view with filters and date ranges
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Date Range</label>
              <div className="text-sm text-muted-foreground">Jan 1, 2024 - Present</div>
            </div>
            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Framework</label>
              <Select value={framework} onValueChange={setFramework}>
                <SelectTrigger>
                  <SelectValue placeholder="All Frameworks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Frameworks</SelectItem>
                  <SelectItem value="gdpr">GDPR</SelectItem>
                  <SelectItem value="sox">SOX</SelectItem>
                  <SelectItem value="ccpa">CCPA</SelectItem>
                  <SelectItem value="hipaa">HIPAA</SelectItem>
                  <SelectItem value="pci">PCI DSS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Document Type</label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Documents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Documents</SelectItem>
                  <SelectItem value="contract">Contracts</SelectItem>
                  <SelectItem value="policy">Policies</SelectItem>
                  <SelectItem value="agreement">Agreements</SelectItem>
                  <SelectItem value="legal">Legal Documents</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="compliance">Compliance Trends</TabsTrigger>
          <TabsTrigger value="risks">Risk Analysis</TabsTrigger>
          <TabsTrigger value="frameworks">Framework Breakdown</TabsTrigger>
          <TabsTrigger value="executive">Executive Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="card-elevated">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <div className="ml-2">
                    <p className="text-sm font-medium text-muted">Overall Compliance</p>
                    <p className="text-2xl font-bold text-success">87%</p>
                    <p className="text-xs text-muted-foreground">+3% from last month</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="card-elevated">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <div className="ml-2">
                    <p className="text-sm font-medium text-muted">Documents Analyzed</p>
                    <p className="text-2xl font-bold">1,248</p>
                    <p className="text-xs text-muted-foreground">+45 this month</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="card-elevated">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <div className="ml-2">
                    <p className="text-sm font-medium text-muted">Active Issues</p>
                    <p className="text-2xl font-bold text-warning">23</p>
                    <p className="text-xs text-muted-foreground">-8 from last month</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="card-elevated">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <div className="ml-2">
                    <p className="text-sm font-medium text-muted">Improvement Rate</p>
                    <p className="text-2xl font-bold text-success">+12%</p>
                    <p className="text-xs text-muted-foreground">Quarter over quarter</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Compliance Trend */}
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Compliance Score Trend</CardTitle>
                <CardDescription>Monthly compliance score progression</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={complianceData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="score" 
                      stroke="hsl(var(--primary))" 
                      fill="hsl(var(--primary))" 
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Risk Distribution */}
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Risk Distribution</CardTitle>
                <CardDescription>Current risk level breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={riskDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {riskDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {riskDistribution.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      ></div>
                      <span className="text-sm">{item.name}: {item.value}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Issues */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Top Compliance Issues</CardTitle>
              <CardDescription>Most frequent issues found across documents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topIssues.map((issue, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-surface">
                    <div className="flex-1">
                      <div className="font-medium">{issue.issue}</div>
                      <div className="text-sm text-muted-foreground">Found in {issue.count} documents</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={getSeverityColor(issue.severity)}>
                        {issue.severity}
                      </Badge>
                      <div className="text-lg font-bold">{issue.count}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Compliance Trends Analysis</CardTitle>
              <CardDescription>Detailed trend analysis across time periods</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={complianceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" name="Score" />
                  <Line type="monotone" dataKey="documents" stroke="hsl(var(--success))" name="Documents" />
                  <Line type="monotone" dataKey="issues" stroke="hsl(var(--destructive))" name="Issues" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risks" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Risk Heatmap</CardTitle>
                <CardDescription>Risk distribution by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {['Data Privacy', 'Financial Compliance', 'Healthcare', 'Payment Security'].map((category, index) => (
                    <div key={category} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{category}</span>
                        <span className="font-medium">{85 - index * 5}%</span>
                      </div>
                      <Progress value={85 - index * 5} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Risk Mitigation Progress</CardTitle>
                <CardDescription>Progress on addressing identified risks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { risk: 'High Risk Issues', resolved: 15, total: 18 },
                    { risk: 'Medium Risk Issues', resolved: 32, total: 45 },
                    { risk: 'Low Risk Issues', resolved: 28, total: 30 }
                  ].map((item) => (
                    <div key={item.risk} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{item.risk}</span>
                        <span className="font-medium">{item.resolved}/{item.total}</span>
                      </div>
                      <Progress value={(item.resolved / item.total) * 100} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="frameworks" className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Framework Compliance Breakdown</CardTitle>
              <CardDescription>Compliance status by regulatory framework</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {frameworkCompliance.map((framework) => (
                  <div key={framework.framework} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{framework.framework}</h3>
                        <p className="text-sm text-muted-foreground">
                          {framework.documents} documents • {framework.issues} issues
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{framework.compliance}%</div>
                        <div className="text-sm text-muted-foreground">Compliance</div>
                      </div>
                    </div>
                    <Progress value={framework.compliance} className="h-3" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="executive" className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Executive Summary</CardTitle>
              <CardDescription>High-level overview for leadership</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center p-4 bg-success/10 rounded-lg">
                  <div className="text-3xl font-bold text-success">87%</div>
                  <div className="text-sm text-muted-foreground">Overall Compliance</div>
                </div>
                <div className="text-center p-4 bg-warning/10 rounded-lg">
                  <div className="text-3xl font-bold text-warning">23</div>
                  <div className="text-sm text-muted-foreground">Active Issues</div>
                </div>
                <div className="text-center p-4 bg-primary/10 rounded-lg">
                  <div className="text-3xl font-bold text-primary">+12%</div>
                  <div className="text-sm text-muted-foreground">QoQ Improvement</div>
                </div>
              </div>

              <div className="prose max-w-none">
                <h3 className="text-lg font-semibold mb-3">Key Insights</h3>
                <ul className="space-y-2 text-sm">
                  <li>• Overall compliance has improved by 12% this quarter, reaching 87%</li>
                  <li>• GDPR compliance leads at 92%, while HIPAA requires attention at 78%</li>
                  <li>• Data retention clauses are the most common compliance gap (15 instances)</li>
                  <li>• Document processing efficiency has increased by 23% with automation</li>
                  <li>• Critical risk issues have been reduced from 6 to 2 this month</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3 mt-6">Recommendations</h3>
                <ul className="space-y-2 text-sm">
                  <li>• Prioritize HIPAA compliance improvements in Q2</li>
                  <li>• Standardize data retention language across all document types</li>
                  <li>• Implement quarterly compliance training for legal team</li>
                  <li>• Expand automated scanning to include SOX requirements</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;