import { useState } from "react";
import { ArrowLeft, FileText, AlertTriangle, CheckCircle, Eye, Download, MessageCircle } from "lucide-react";
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
import { ChatInterface } from "./chat/ChatInterface";

type ClauseStatus = "compliant" | "warning" | "critical";
type DocumentStatus = "compliant" | "warning" | "critical" | "processing";

interface DocumentDetailProps {
  documentId: number;
  onBack: () => void;
}

const documentData = {
  1: {
    name: "Employment_Contract_v2.pdf",
    type: "Contract",
    uploadDate: "2024-01-15",
    status: "compliant" as DocumentStatus,
    score: 94,
    size: "2.3 MB",
    issues: 0,
    clauses: [
      {
        id: 1,
        title: "Termination Clause",
        content: "Either party may terminate this agreement with 30 days written notice...",
        status: "compliant" as ClauseStatus,
        confidence: 95,
        feedback: "Clause meets legal requirements for employment termination."
      },
      {
        id: 2,
        title: "Compensation Terms",
        content: "Employee shall receive salary of $X annually, paid bi-weekly...",
        status: "compliant" as ClauseStatus,
        confidence: 98,
        feedback: "Compensation structure is clearly defined and compliant."
      },
      {
        id: 3,
        title: "Confidentiality Agreement",
        content: "Employee agrees to maintain confidentiality of proprietary information...",
        status: "compliant" as ClauseStatus,
        confidence: 92,
        feedback: "Standard confidentiality terms are appropriate."
      }
    ]
  },
  2: {
    name: "Privacy_Policy_Updated.docx",
    type: "Policy",
    uploadDate: "2024-01-14",
    status: "warning" as DocumentStatus,
    score: 78,
    size: "1.8 MB",
    issues: 3,
    clauses: [
      {
        id: 1,
        title: "Data Collection Statement",
        content: "We collect personal information when you use our services...",
        status: "warning" as ClauseStatus,
        confidence: 72,
        feedback: "Missing specific categories of data collected. Consider adding detailed enumeration."
      },
      {
        id: 2,
        title: "Third-Party Data Sharing",
        content: "We may share your information with trusted partners...",
        status: "critical" as ClauseStatus,
        confidence: 45,
        feedback: "Vague language around data sharing. GDPR requires specific purposes and legal basis."
      },
      {
        id: 3,
        title: "User Rights Section",
        content: "Users have the right to access, modify, or delete their personal data...",
        status: "compliant" as ClauseStatus,
        confidence: 89,
        feedback: "User rights are clearly outlined and GDPR compliant."
      },
      {
        id: 4,
        title: "Data Retention Policy",
        content: "Personal data will be retained for business purposes...",
        status: "warning" as ClauseStatus,
        confidence: 65,
        feedback: "Retention period is too vague. Specify exact timeframes for different data types."
      }
    ]
  },
  3: {
    name: "Saudi_Labor_Contract_KSA.pdf",
    type: "Contract",
    uploadDate: "2024-01-13",
    status: "compliant" as DocumentStatus,
    score: 91,
    size: "3.1 MB",
    issues: 1,
    clauses: [
      {
        id: 1,
        title: "Employment Terms",
        content: "Employee shall work 8 hours per day, 5 days per week as per Saudi Labor Law...",
        status: "compliant" as ClauseStatus,
        confidence: 94,
        feedback: "Working hours comply with Saudi Labor Law Article 98."
      },
      {
        id: 2,
        title: "Probation Period",
        content: "Employee probation period shall not exceed 90 days as mandated by law...",
        status: "compliant" as ClauseStatus,
        confidence: 98,
        feedback: "Probation period aligns with Saudi Labor Law Article 53."
      },
      {
        id: 3,
        title: "End of Service Benefits",
        content: "Gratuity calculation based on years of service according to Article 84...",
        status: "warning" as ClauseStatus,
        confidence: 82,
        feedback: "Consider adding specific calculation details for clarity."
      }
    ]
  },
  5: {
    name: "CMA_Disclosure_Policy_2024.pdf",
    type: "Policy",
    uploadDate: "2024-01-11",
    status: "compliant" as DocumentStatus,
    score: 89,
    size: "2.7 MB",
    issues: 1,
    clauses: [
      {
        id: 1,
        title: "Material Information Disclosure",
        content: "All material information shall be disclosed according to CMA regulations...",
        status: "compliant" as ClauseStatus,
        confidence: 92,
        feedback: "Disclosure requirements meet CMA Article 49 standards."
      },
      {
        id: 2,
        title: "Insider Trading Prevention",
        content: "Measures to prevent insider trading and maintain market integrity...",
        status: "compliant" as ClauseStatus,
        confidence: 88,
        feedback: "Robust insider trading prevention measures in place."
      }
    ]
  }
};

const statusConfig = {
  compliant: {
    icon: CheckCircle,
    className: "badge-compliant",
    label: "Compliant",
    color: "text-success"
  },
  warning: {
    icon: AlertTriangle,
    className: "badge-warning",
    label: "Needs Review",
    color: "text-warning"
  },
  critical: {
    icon: AlertTriangle,
    className: "badge-critical",
    label: "Critical Issues",
    color: "text-destructive"
  },
  processing: {
    icon: AlertTriangle,
    className: "bg-secondary text-secondary-foreground",
    label: "Processing",
    color: "text-muted"
  }
};

export function DocumentDetail({ documentId, onBack }: DocumentDetailProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  
  const doc = documentData[documentId as keyof typeof documentData];
  
  if (!doc) {
    return <div>Document not found</div>;
  }

  const getStatusBadge = (status: keyof typeof statusConfig) => {
    const config = statusConfig[status];
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.className} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-destructive";
  };

  const compliantClauses = doc.clauses.filter(c => c.status === 'compliant').length;
  const warningClauses = doc.clauses.filter(c => c.status === 'warning').length;
  const criticalClauses = doc.clauses.filter(c => c.status === 'critical').length;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4 border-b pb-6">
        <Button variant="ghost" onClick={onBack} className="interactive">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Documents
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{doc.name}</h1>
          <p className="text-muted-foreground">
            Detailed compliance analysis and clause breakdown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="interactive">
            <Eye className="h-4 w-4 mr-2" />
            View Document
          </Button>
          <Button variant="outline" className="interactive">
            <Download className="h-4 w-4 mr-2" />
            Download Report
          </Button>
          <Button 
            onClick={() => setIsChatOpen(true)} 
            className="bg-primary hover:bg-primary/90"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Ask AI Assistant
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Analysis */}
        <div className="lg:col-span-2 space-y-6">
          {/* Document Overview */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Document Overview</CardTitle>
              <CardDescription>
                Compliance analysis summary for {doc.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center">
                  <div className={`text-3xl font-bold ${getScoreColor(doc.score)}`}>
                    {doc.score}%
                  </div>
                  <p className="text-sm text-muted-foreground">Overall Score</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold">{doc.clauses.length}</div>
                  <p className="text-sm text-muted-foreground">Total Clauses</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-destructive">{doc.issues}</div>
                  <p className="text-sm text-muted-foreground">Issues Found</p>
                </div>
              </div>
              
              <Separator className="my-4" />
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Compliant Clauses</span>
                  <span className="text-sm font-medium text-success">{compliantClauses}</span>
                </div>
                <Progress value={(compliantClauses / doc.clauses.length) * 100} className="h-2" />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Needs Review</span>
                  <span className="text-sm font-medium text-warning">{warningClauses}</span>
                </div>
                <Progress 
                  value={(warningClauses / doc.clauses.length) * 100} 
                  className="h-2 [&>div]:bg-warning" 
                />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Critical Issues</span>
                  <span className="text-sm font-medium text-destructive">{criticalClauses}</span>
                </div>
                <Progress 
                  value={(criticalClauses / doc.clauses.length) * 100} 
                  className="h-2 [&>div]:bg-destructive" 
                />
              </div>
            </CardContent>
          </Card>

          {/* Clause Analysis */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Clause-by-Clause Analysis</CardTitle>
              <CardDescription>
                Detailed breakdown of each clause and its compliance status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {doc.clauses.map((clause, index) => {
                  const config = statusConfig[clause.status];
                  const Icon = config.icon;
                  
                  return (
                    <AccordionItem key={clause.id} value={`clause-${clause.id}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 text-left">
                          <Icon className={`h-4 w-4 ${config.color}`} />
                          <div>
                            <div className="font-medium">{clause.title}</div>
                            <div className="text-sm text-muted-foreground">
                              Confidence: {clause.confidence}%
                            </div>
                          </div>
                          {getStatusBadge(clause.status)}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-4">
                          <div>
                            <h4 className="font-medium mb-2">Clause Content</h4>
                            <p className="text-sm text-muted-foreground bg-surface p-3 rounded-md">
                              {clause.content}
                            </p>
                          </div>
                          
                          <div>
                            <h4 className="font-medium mb-2">Compliance Feedback</h4>
                            <p className="text-sm">{clause.feedback}</p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-sm">Confidence Level:</span>
                            <Progress value={clause.confidence} className="flex-1 h-2" />
                            <span className="text-sm font-medium">{clause.confidence}%</span>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Document Info */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Document Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-medium">{doc.name}</span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <Badge variant="outline">{doc.type}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  {getStatusBadge(doc.status)}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size:</span>
                  <span>{doc.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uploaded:</span>
                  <span>{new Date(doc.uploadDate).toLocaleDateString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Assistant Card */}
          <Card className="card-elevated border-primary/20 bg-primary/5 dark:bg-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                AI Compliance Assistant
              </CardTitle>
              <CardDescription>
                Get instant answers about this document's compliance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ask me about:
                </p>
                <ul className="text-sm space-y-1">
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-primary rounded-full"></div>
                    Compliance issues and fixes
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-primary rounded-full"></div>
                    Legal requirements explanation
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-primary rounded-full"></div>
                    Risk assessment
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-primary rounded-full"></div>
                    Improvement suggestions
                  </li>
                </ul>
                <Button 
                  onClick={() => setIsChatOpen(true)} 
                  className="w-full"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Start Chat
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
              <CardDescription>
                Suggested improvements for compliance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {doc.status !== 'compliant' && (
                <>
                  <div className="p-3 bg-warning/10 border border-warning/20 rounded-md">
                    <h4 className="font-medium text-warning mb-1">High Priority</h4>
                    <p className="text-sm">Review data sharing clauses for GDPR compliance</p>
                  </div>
                  
                  <div className="p-3 bg-muted/50 border border-border rounded-md">
                    <h4 className="font-medium mb-1">Medium Priority</h4>
                    <p className="text-sm">Specify data retention timeframes</p>
                  </div>
                </>
              )}
              
              {doc.status === 'compliant' && (
                <div className="p-3 bg-success/10 border border-success/20 rounded-md">
                  <h4 className="font-medium text-success mb-1">Excellent</h4>
                  <p className="text-sm">Document meets all compliance requirements</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Chat Interface */}
      {isChatOpen && (
        <ChatInterface
          document={doc}
          isMinimized={isChatMinimized}
          onMinimize={() => setIsChatMinimized(true)}
          onMaximize={() => setIsChatMinimized(false)}
          onClose={() => {
            setIsChatOpen(false);
            setIsChatMinimized(false);
          }}
        />
      )}
    </div>
  );
}