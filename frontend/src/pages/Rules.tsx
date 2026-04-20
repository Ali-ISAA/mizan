import { useState } from "react";
import { Shield, Plus, Search, Filter, Edit, Trash2, Upload, Download, Eye, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { RuleDetail } from "@/components/rule-detail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const rules = [
  {
    id: 1,
    name: "GDPR Article 6 - Legal Basis",
    framework: "GDPR",
    category: "Data Protection",
    status: "active" as const,
    version: "2.1",
    lastUpdated: "2024-01-10",
    description: "Defines the legal basis required for processing personal data under GDPR",
    severity: "critical" as const,
    documents: 45
  },
  {
    id: 2,
    name: "SOX Section 404 - Internal Controls",
    framework: "SOX",
    category: "Financial Compliance",
    status: "active" as const,
    version: "1.8",
    lastUpdated: "2024-01-08",
    description: "Requirements for internal control over financial reporting",
    severity: "high" as const,
    documents: 23
  },
  {
    id: 3,
    name: "CCPA Consumer Rights",
    framework: "CCPA",
    category: "Privacy Rights",
    status: "active" as const,
    version: "1.3",
    lastUpdated: "2024-01-05",
    description: "California Consumer Privacy Act rights and disclosure requirements",
    severity: "high" as const,
    documents: 18
  },
  {
    id: 4,
    name: "Saudi Labor Law Article 75",
    framework: "Saudi Labor Law",
    category: "Employment Rights",
    status: "active" as const,
    version: "1.2",
    lastUpdated: "2024-01-05",
    description: "Termination procedures and employee rights under Saudi Arabian Labor Law",
    severity: "high" as const,
    documents: 12
  },
  {
    id: 5,
    name: "Saudi Commercial Law Article 10",
    framework: "Saudi Commercial Law",
    category: "Business Operations",
    status: "active" as const,
    version: "1.1",
    lastUpdated: "2024-01-03",
    description: "Commercial registration and business licensing requirements in KSA",
    severity: "critical" as const,
    documents: 8
  },
  {
    id: 6,
    name: "Capital Market Authority (CMA) Regulations",
    framework: "Saudi CMA",
    category: "Financial Markets",
    status: "active" as const,
    version: "2.0",
    lastUpdated: "2024-01-01",
    description: "Securities market regulations and disclosure requirements in Saudi Arabia",
    severity: "critical" as const,
    documents: 15
  },
  {
    id: 7,
    name: "SAMA Banking Regulations",
    framework: "SAMA",
    category: "Banking & Finance",
    status: "active" as const,
    version: "1.5",
    lastUpdated: "2023-12-28",
    description: "Saudi Arabian Monetary Authority banking compliance requirements",
    severity: "critical" as const,
    documents: 22
  },
  {
    id: 8,
    name: "PCI DSS Data Storage",
    framework: "PCI DSS",
    category: "Payment Security",
    status: "deprecated" as const,
    version: "1.2",
    lastUpdated: "2023-12-15",
    description: "Payment card industry data security standards for storage",
    severity: "medium" as const,
    documents: 12
  }
];

const frameworks = [
  { name: "GDPR", rules: 12, coverage: 95 },
  { name: "SOX", rules: 8, coverage: 88 },
  { name: "Saudi Labor Law", rules: 15, coverage: 82 },
  { name: "Saudi CMA", rules: 10, coverage: 78 },
  { name: "SAMA", rules: 18, coverage: 85 },
  { name: "CCPA", rules: 6, coverage: 92 },
  { name: "PCI DSS", rules: 7, coverage: 90 }
];

const statusConfig = {
  active: { color: "badge-compliant", label: "Active" },
  draft: { color: "badge-warning", label: "Draft" },
  deprecated: { color: "bg-muted text-muted-foreground", label: "Deprecated" }
};

const severityConfig = {
  critical: { color: "badge-critical", label: "Critical" },
  high: { color: "badge-warning", label: "High" },
  medium: { color: "bg-secondary text-secondary-foreground", label: "Medium" }
};

const Rules = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [selectedRule, setSelectedRule] = useState<number | null>(null);

  if (selectedRule) {
    return <RuleDetail ruleId={selectedRule} onBack={() => setSelectedRule(null)} />;
  }

  const filteredRules = rules.filter(rule => {
    const matchesSearch = rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         rule.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFramework = frameworkFilter === "all" || rule.framework === frameworkFilter;
    const matchesStatus = statusFilter === "all" || rule.status === statusFilter;
    return matchesSearch && matchesFramework && matchesStatus;
  });

  return (
    <div className="flex-1 space-y-8 p-8 animate-fade-in">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Compliance Rules</h1>
            <p className="text-text-secondary mt-2 text-base">
              Manage compliance frameworks and rules for your organization.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Import Rules
            </Button>
            <Dialog open={isAddingRule} onOpenChange={setIsAddingRule}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[525px] bg-popover">
                <DialogHeader>
                  <DialogTitle>Add New Compliance Rule</DialogTitle>
                  <DialogDescription>
                    Create a new compliance rule for your organization.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rule-name">Rule Name</Label>
                    <Input id="rule-name" placeholder="Enter rule name" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="framework">Framework</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select framework" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gdpr">GDPR</SelectItem>
                        <SelectItem value="sox">SOX</SelectItem>
                        <SelectItem value="ccpa">CCPA</SelectItem>
                        <SelectItem value="saudi-cma">Saudi CMA</SelectItem>
                        <SelectItem value="sama">SAMA</SelectItem>
                        <SelectItem value="saudi-labor">Saudi Labor Law</SelectItem>
                        <SelectItem value="pci">PCI DSS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" placeholder="Describe the compliance rule" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="severity">Severity</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select severity" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddingRule(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setIsAddingRule(false)}>
                    Create Rule
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <Tabs defaultValue="rules" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="rules">
            Rules Library
          </TabsTrigger>
          <TabsTrigger value="frameworks">
            Frameworks
          </TabsTrigger>
          <TabsTrigger value="templates">
            Templates
          </TabsTrigger>
          <TabsTrigger value="updates">
            Version Control
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-6">
          {/* Framework Overview */}
          <div className="grid gap-4 md:grid-cols-5">
            {frameworks.map((framework) => (
              <Card key={framework.name} className="card-elevated">
                <CardContent className="p-4">
                  <div className="text-center space-y-2">
                    <h3 className="font-semibold">{framework.name}</h3>
                    <div className="text-2xl font-bold text-primary">{framework.rules}</div>
                    <p className="text-xs text-muted-foreground">Rules</p>
                    <div className="flex items-center justify-center gap-1">
                      <div className="text-sm font-medium">{framework.coverage}%</div>
                      <div className="text-xs text-muted-foreground">Coverage</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Rules Table */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Compliance Rules ({filteredRules.length})</CardTitle>
              <CardDescription>
                Manage and configure compliance rules for your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input
                    placeholder="Search rules..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                
                <Select value={frameworkFilter} onValueChange={setFrameworkFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Frameworks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Frameworks</SelectItem>
                    <SelectItem value="GDPR">GDPR</SelectItem>
                    <SelectItem value="SOX">SOX</SelectItem>
                    <SelectItem value="CCPA">CCPA</SelectItem>
                    <SelectItem value="Saudi Labor Law">Saudi Labor Law</SelectItem>
                    <SelectItem value="Saudi CMA">Saudi CMA</SelectItem>
                    <SelectItem value="SAMA">SAMA</SelectItem>
                    <SelectItem value="PCI DSS">PCI DSS</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="deprecated">Deprecated</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Framework</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Documents</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="w-[70px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRules.map((rule) => (
                      <TableRow key={rule.id} className="hover:bg-surface">
                        <TableCell>
                          <div>
                            <div className="font-medium">{rule.name}</div>
                            <div className="text-sm text-muted-foreground truncate max-w-xs">
                              {rule.description}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.framework}</Badge>
                        </TableCell>
                        <TableCell>{rule.category}</TableCell>
                        <TableCell>
                          <Badge className={statusConfig[rule.status].color}>
                            {statusConfig[rule.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={severityConfig[rule.severity].color}>
                            {severityConfig[rule.severity].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{rule.version}</TableCell>
                        <TableCell>{rule.documents}</TableCell>
                        <TableCell>{new Date(rule.lastUpdated).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <Shield className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover">
                              <DropdownMenuItem onClick={() => setSelectedRule(rule.id)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Rule
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Download className="mr-2 h-4 w-4" />
                                Export
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="frameworks" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {frameworks.map((framework) => (
              <Card key={framework.name} className="card-elevated">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    {framework.name} Framework
                  </CardTitle>
                  <CardDescription>
                    {framework.rules} active rules with {framework.coverage}% coverage
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Coverage</span>
                      <span className="font-medium">{framework.coverage}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all" 
                        style={{ width: `${framework.coverage}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Active Rules</span>
                    <span className="text-lg font-bold">{framework.rules}</span>
                  </div>
                  <Button variant="outline" className="w-full interactive">
                    Manage {framework.name} Rules
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Rule Templates</CardTitle>
              <CardDescription>
                Pre-built compliance rule templates for common frameworks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Shield className="mx-auto h-16 w-16 text-muted mb-4" />
                <h3 className="text-lg font-semibold mb-2">Templates Coming Soon</h3>
                <p className="text-muted-foreground">
                  We're working on comprehensive rule templates for major compliance frameworks.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="updates" className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Version Control</CardTitle>
              <CardDescription>
                Track changes and updates to your compliance rules
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  {
                    rule: "GDPR Article 6 - Legal Basis",
                    version: "2.1 → 2.2",
                    date: "2024-01-10",
                    type: "update",
                    author: "John Doe"
                  },
                  {
                    rule: "SOX Section 404 - Internal Controls",
                    version: "1.7 → 1.8", 
                    date: "2024-01-08",
                    type: "update",
                    author: "Jane Smith"
                  },
                  {
                    rule: "CCPA Consumer Rights",
                    version: "1.3",
                    date: "2024-01-05",
                    type: "created",
                    author: "Legal Team"
                  }
                ].map((update, index) => (
                  <div key={index} className="flex items-center gap-4 p-3 rounded-lg bg-surface">
                    <div className={`h-2 w-2 rounded-full ${
                      update.type === 'created' ? 'bg-success' : 'bg-primary'
                    }`}></div>
                    <div className="flex-1">
                      <div className="font-medium">{update.rule}</div>
                      <div className="text-sm text-muted-foreground">
                        Version {update.version} by {update.author}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(update.date).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Rules;