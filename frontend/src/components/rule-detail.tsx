import { useState } from "react";
import { ArrowLeft, Shield, FileText, AlertTriangle, CheckCircle, X, Eye, Download, Edit, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface RuleDetailProps {
  ruleId: number;
  onBack: () => void;
}

const ruleData = {
  1: {
    name: "GDPR Article 6 - Legal Basis",
    framework: "GDPR",
    category: "Data Protection",
    status: "active" as const,
    version: "2.1",
    lastUpdated: "2024-01-10",
    description: "Defines the legal basis required for processing personal data under GDPR",
    severity: "critical" as const,
    documents: 45,
    fullDescription: "Article 6 of the GDPR sets out the legal bases for processing personal data. Processing is only lawful if and to the extent that at least one of the following applies: consent, contract, legal obligation, vital interests, public task, or legitimate interests.",
    requirements: [
      {
        id: 1,
        title: "Explicit Consent",
        description: "Data subject has given consent to processing for specific purposes",
        status: "required" as const,
        examples: ["Consent forms", "Opt-in checkboxes", "Digital signatures"]
      },
      {
        id: 2,
        title: "Contractual Necessity",
        description: "Processing necessary for performance of a contract",
        status: "required" as const,
        examples: ["Employment contracts", "Service agreements", "Purchase orders"]
      },
      {
        id: 3,
        title: "Legal Obligation",
        description: "Processing necessary for compliance with legal obligation",
        status: "conditional" as const,
        examples: ["Tax records", "Anti-money laundering", "Court orders"]
      }
    ],
    relatedRules: ["GDPR Article 7 - Consent", "GDPR Article 9 - Special Categories"],
    penalties: "Up to €20 million or 4% of annual global turnover"
  },
  4: {
    name: "Saudi Labor Law Article 75",
    framework: "Saudi Labor Law",
    category: "Employment Rights",
    status: "active" as const,
    version: "1.2",
    lastUpdated: "2024-01-05",
    description: "Termination procedures and employee rights under Saudi Arabian Labor Law",
    severity: "high" as const,
    documents: 12,
    fullDescription: "Article 75 of the Saudi Labor Law governs the termination of employment contracts, establishing mandatory procedures, notice periods, and compensation requirements for both employers and employees in the Kingdom of Saudi Arabia.",
    requirements: [
      {
        id: 1,
        title: "Notice Period",
        description: "30-60 day notice period depending on employment duration",
        status: "required" as const,
        examples: ["Written termination notice", "Email confirmation", "Registered mail"]
      },
      {
        id: 2,
        title: "End of Service Benefits",
        description: "Calculation of gratuity based on years of service",
        status: "required" as const,
        examples: ["Half month salary per year (first 5 years)", "Full month salary per year (after 5 years)"]
      },
      {
        id: 3,
        title: "Final Settlement",
        description: "Payment of outstanding dues within 7 days",
        status: "required" as const,
        examples: ["Unpaid salary", "Overtime compensation", "Vacation entitlement"]
      }
    ],
    relatedRules: ["Labor Law Article 77 - Arbitrary Dismissal", "Labor Law Article 84 - Dispute Resolution"],
    penalties: "Fine up to SAR 300,000 and compensation to employee"
  }
};

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

const requirementStatusConfig = {
  required: { color: "badge-critical", label: "Required" },
  conditional: { color: "badge-warning", label: "Conditional" },
  optional: { color: "bg-secondary text-secondary-foreground", label: "Optional" }
};

export function RuleDetail({ ruleId, onBack }: RuleDetailProps) {
  const rule = ruleData[ruleId as keyof typeof ruleData];
  
  if (!rule) {
    return <div>Rule not found</div>;
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4 border-b pb-6">
        <Button variant="ghost" onClick={onBack} className="interactive">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Rules
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{rule.name}</h1>
          <p className="text-muted-foreground">
            {rule.framework} • {rule.category}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="interactive">
            <Edit className="h-4 w-4 mr-2" />
            Edit Rule
          </Button>
          <Button variant="outline" className="interactive">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Rule Overview */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Rule Overview</CardTitle>
              <CardDescription>
                Detailed information about this compliance rule
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">Description</h3>
                <p className="text-sm text-muted-foreground">{rule.fullDescription}</p>
              </div>
              
              <Separator />
              
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{rule.documents}</div>
                  <p className="text-sm text-muted-foreground">Affected Documents</p>
                </div>
                <div className="text-center">
                  <Badge className={severityConfig[rule.severity].color}>
                    {severityConfig[rule.severity].label}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-1">Severity Level</p>
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium">v{rule.version}</div>
                  <p className="text-sm text-muted-foreground">Current Version</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Requirements */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Compliance Requirements</CardTitle>
              <CardDescription>
                Specific requirements and implementation guidelines
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {rule.requirements.map((req, index) => (
                  <AccordionItem key={req.id} value={`req-${req.id}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3 text-left">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <div className="flex-1">
                          <div className="font-medium">{req.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {req.description}
                          </div>
                        </div>
                        <Badge className={requirementStatusConfig[req.status].color}>
                          {requirementStatusConfig[req.status].label}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-4">
                        <div>
                          <h4 className="font-medium mb-2">Implementation Examples</h4>
                          <ul className="space-y-1">
                            {req.examples.map((example, idx) => (
                              <li key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                                <div className="w-1 h-1 bg-primary rounded-full"></div>
                                {example}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          {/* Related Rules */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Related Rules</CardTitle>
              <CardDescription>
                Other compliance rules that may be relevant
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {rule.relatedRules.map((relatedRule, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-surface hover:bg-surface-hover interactive">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{relatedRule}</span>
                    <Button variant="ghost" size="sm" className="ml-auto h-6 px-2">
                      <Eye className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Rule Info */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Rule Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Framework:</span>
                  <Badge variant="outline">{rule.framework}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category:</span>
                  <span>{rule.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className={statusConfig[rule.status].color}>
                    {statusConfig[rule.status].label}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version:</span>
                  <span className="font-mono">{rule.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated:</span>
                  <span>{new Date(rule.lastUpdated).toLocaleDateString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compliance Impact */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Compliance Impact</CardTitle>
              <CardDescription>
                Penalties and consequences for non-compliance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <h4 className="font-medium text-destructive mb-2">Penalties</h4>
                <p className="text-sm">{rule.penalties}</p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start interactive">
                <FileText className="h-4 w-4 mr-2" />
                View Affected Documents
              </Button>
              <Button variant="outline" className="w-full justify-start interactive">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule Review
              </Button>
              <Button variant="outline" className="w-full justify-start interactive">
                <Download className="h-4 w-4 mr-2" />
                Export Rule Details
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}