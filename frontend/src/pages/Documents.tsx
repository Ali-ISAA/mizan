import { useState } from "react";
import { FileText, Search, Filter, Eye, Download, MoreHorizontal, AlertTriangle, CheckCircle, Clock, Trash2 } from "lucide-react";
import { DocumentDetail } from "@/components/enhanced-document-detail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const documents = [
  {
    id: 1,
    name: "Employment_Contract_v2.pdf",
    type: "Contract",
    uploadDate: "2024-01-15",
    status: "compliant" as const,
    score: 94,
    size: "2.3 MB",
    issues: 0
  },
  {
    id: 2,
    name: "Privacy_Policy_Updated.docx",
    type: "Policy",
    uploadDate: "2024-01-14",
    status: "warning" as const,
    score: 78,
    size: "1.8 MB",
    issues: 3
  },
  {
    id: 3,
    name: "Saudi_Labor_Contract_KSA.pdf",
    type: "Contract",
    uploadDate: "2024-01-13",
    status: "compliant" as const,
    score: 91,
    size: "3.1 MB",
    issues: 1
  },
  {
    id: 4,
    name: "Data_Processing_Terms.pdf",
    type: "Legal Doc",
    uploadDate: "2024-01-12",
    status: "critical" as const,
    score: 52,
    size: "3.2 MB",
    issues: 8
  },
  {
    id: 5,
    name: "CMA_Disclosure_Policy_2024.pdf",
    type: "Policy",
    uploadDate: "2024-01-11",
    status: "compliant" as const,
    score: 89,
    size: "2.7 MB",
    issues: 1
  },
  {
    id: 6,
    name: "SAMA_Banking_Agreement.pdf",
    type: "Agreement",
    uploadDate: "2024-01-10",
    status: "warning" as const,
    score: 72,
    size: "4.2 MB",
    issues: 4
  },
  {
    id: 7,
    name: "Commercial_Registration_KSA.pdf",
    type: "Legal Doc",
    uploadDate: "2024-01-09",
    status: "compliant" as const,
    score: 88,
    size: "1.9 MB",
    issues: 2
  },
  {
    id: 8,
    name: "Vendor_Agreement_2024.pdf",
    type: "Agreement",
    uploadDate: "2024-01-08",
    status: "processing" as const,
    score: null,
    size: "4.1 MB",
    issues: null
  }
];

const statusConfig = {
  compliant: {
    icon: CheckCircle,
    variant: "success" as const,
    label: "Compliant"
  },
  warning: {
    icon: AlertTriangle,
    variant: "warning" as const,
    label: "Needs Review"
  },
  critical: {
    icon: AlertTriangle,
    variant: "critical" as const,
    label: "Critical Issues"
  },
  processing: {
    icon: Clock,
    variant: "processing" as const,
    label: "Processing"
  }
};

const Documents = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedDocument, setSelectedDocument] = useState<number | null>(null);

  if (selectedDocument) {
    return <DocumentDetail documentId={selectedDocument} onBack={() => setSelectedDocument(null)} />;
  }

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || doc.status === statusFilter;
    const matchesType = typeFilter === "all" || doc.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: keyof typeof statusConfig) => {
    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success font-semibold";
    if (score >= 60) return "text-warning font-semibold";
    return "text-critical font-semibold";
  };

  return (
    <div className="flex-1 space-y-8 p-8 animate-fade-in">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Document Library
        </h1>
        <p className="text-text-secondary mt-2 text-base">
          View, search, and manage your uploaded documents and their compliance status.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card className="card-elevated group hover:shadow-xl transition-shadow duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-600/10 group-hover:bg-accent-600/20 transition-colors">
                <FileText className="h-5 w-5 text-accent-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Total Documents</p>
                <p className="text-2xl font-bold mt-1">{documents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated group hover:shadow-xl transition-shadow duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 group-hover:bg-success/20 transition-colors">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Compliant</p>
                <p className="text-2xl font-bold text-success mt-1">
                  {documents.filter(d => d.status === 'compliant').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated group hover:shadow-xl transition-shadow duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 group-hover:bg-warning/20 transition-colors">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Need Review</p>
                <p className="text-2xl font-bold text-warning mt-1">
                  {documents.filter(d => d.status === 'warning').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated group hover:shadow-xl transition-shadow duration-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-critical/10 group-hover:bg-critical/20 transition-colors">
                <AlertTriangle className="h-5 w-5 text-critical" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Critical</p>
                <p className="text-2xl font-bold text-critical mt-1">
                  {documents.filter(d => d.status === 'critical').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Table Card */}
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-foreground">Documents</CardTitle>
          <CardDescription className="text-text-secondary">
            Search and filter your document library
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="compliant">Compliant</SelectItem>
                <SelectItem value="warning">Needs Review</SelectItem>
                <SelectItem value="critical">Critical Issues</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Contract">Contract</SelectItem>
                <SelectItem value="Policy">Policy</SelectItem>
                <SelectItem value="Agreement">Agreement</SelectItem>
                <SelectItem value="Legal Doc">Legal Doc</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Documents Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Upload Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Compliance Score</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="w-[70px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-accent-600" />
                      <span className="text-foreground">{doc.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{doc.type}</Badge>
                  </TableCell>
                  <TableCell className="text-text-secondary">{formatDate(doc.uploadDate)}</TableCell>
                  <TableCell>{getStatusBadge(doc.status)}</TableCell>
                  <TableCell>
                    {doc.score ? (
                      <span className={getScoreColor(doc.score)}>
                        {doc.score}%
                      </span>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {doc.issues !== null ? (
                      <span className={doc.issues > 0 ? "text-warning font-medium" : "text-success font-medium"}>
                        {doc.issues}
                      </span>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-text-secondary">{doc.size}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-surface-elevated border-border">
                        <DropdownMenuItem
                          onClick={() => setSelectedDocument(doc.id)}
                          className="cursor-pointer"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View Analysis
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer">
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-critical hover:bg-critical/10">
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

          {filteredDocuments.length === 0 && (
            <div className="text-center py-12 border-t border-border mt-6">
              <div className="flex justify-center mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface">
                  <FileText className="h-8 w-8 text-text-muted" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No documents found</h3>
              <p className="text-text-secondary">
                Try adjusting your search or filter criteria.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Documents;
