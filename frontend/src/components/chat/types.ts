export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  relatedClause?: number;
  suggestions?: string[];
  confidence?: number;
}

export interface ComplianceTemplate {
  id: string;
  title: string;
  question: string;
  category: 'analysis' | 'improvement' | 'explanation' | 'risk';
  icon: any;
  description: string;
  documentTypes?: string[];
}

export interface DocumentData {
  id: number;
  name: string;
  type: string;
  status: 'compliant' | 'warning' | 'critical' | 'processing';
  score: number;
  size: string;
  issues: number;
  uploadDate: string;
  clauses: Array<{
    id: number;
    title: string;
    status: 'compliant' | 'warning' | 'critical';
    content: string;
    confidence: number;
    feedback: string;
  }>;
}
