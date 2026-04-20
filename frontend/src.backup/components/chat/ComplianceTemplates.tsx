import { 
  Scale, 
  AlertTriangle, 
  Lightbulb, 
  FileText, 
  CheckCircle, 
  Search,
  Shield,
  TrendingUp,
  MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ComplianceTemplate {
  id: string;
  title: string;
  question: string;
  category: 'analysis' | 'improvement' | 'explanation' | 'risk';
  icon: any;
  description: string;
  documentTypes?: string[];
}

interface ComplianceTemplatesProps {
  onSelectTemplate: (question: string) => void;
  documentType?: string;
}

export function ComplianceTemplates({ onSelectTemplate, documentType }: ComplianceTemplatesProps) {
  const templates: ComplianceTemplate[] = [
    {
      id: '1',
      title: 'Overall Analysis',
      question: 'What are the main compliance issues in this document?',
      category: 'analysis',
      icon: Scale,
      description: 'Get comprehensive compliance overview',
      documentTypes: ['Contract', 'Policy', 'Agreement', 'Legal Doc']
    },
    {
      id: '2',
      title: 'Critical Issues',
      question: 'What critical compliance issues need immediate attention?',
      category: 'risk',
      icon: AlertTriangle,
      description: 'Identify high-priority problems',
      documentTypes: ['Contract', 'Policy', 'Agreement', 'Legal Doc']
    },
    {
      id: '3',
      title: 'GDPR Compliance',
      question: 'How does this document comply with GDPR requirements?',
      category: 'analysis',
      icon: Shield,
      description: 'Check data protection compliance',
      documentTypes: ['Policy', 'Agreement', 'Legal Doc']
    },
    {
      id: '4',
      title: 'Saudi Labor Law',
      question: 'Does this contract comply with Saudi Labor Law?',
      category: 'analysis',
      icon: Scale,
      description: 'Verify KSA labor compliance',
      documentTypes: ['Contract']
    },
    {
      id: '5',
      title: 'Improvement Plan',
      question: 'What specific changes should I make to improve compliance?',
      category: 'improvement',
      icon: Lightbulb,
      description: 'Get actionable recommendations',
      documentTypes: ['Contract', 'Policy', 'Agreement', 'Legal Doc']
    },
    {
      id: '6',
      title: 'Clause Explanation',
      question: 'Can you explain the problematic clauses in simple terms?',
      category: 'explanation',
      icon: FileText,
      description: 'Understand complex legal language',
      documentTypes: ['Contract', 'Agreement', 'Legal Doc']
    },
    {
      id: '7',
      title: 'Risk Assessment',
      question: 'What are the potential legal risks in this document?',
      category: 'risk',
      icon: AlertTriangle,
      description: 'Identify legal exposures',
      documentTypes: ['Contract', 'Policy', 'Agreement', 'Legal Doc']
    },
    {
      id: '8',
      title: 'Best Practices',
      question: 'What industry best practices should be included?',
      category: 'improvement',
      icon: CheckCircle,
      description: 'Learn compliance best practices',
      documentTypes: ['Policy', 'Agreement']
    },
    {
      id: '9',
      title: 'CMA Compliance',
      question: 'Does this meet Capital Market Authority requirements?',
      category: 'analysis',
      icon: TrendingUp,
      description: 'Check CMA regulatory compliance',
      documentTypes: ['Policy', 'Legal Doc']
    },
    {
      id: '10',
      title: 'SAMA Banking Rules',
      question: 'How does this align with SAMA banking regulations?',
      category: 'analysis',
      icon: Shield,
      description: 'Verify banking compliance',
      documentTypes: ['Agreement', 'Policy']
    }
  ];

  // Filter templates based on document type
  const relevantTemplates = templates.filter(template => 
    !documentType || !template.documentTypes || template.documentTypes.includes(documentType)
  );

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'analysis': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'improvement': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'explanation': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'risk': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'analysis': return Search;
      case 'improvement': return Lightbulb;
      case 'explanation': return FileText;
      case 'risk': return AlertTriangle;
      default: return MessageCircle;
    }
  };

  // Group templates by category
  const groupedTemplates = relevantTemplates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, ComplianceTemplate[]>);

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
        <Lightbulb className="h-3 w-3" />
        Quick Questions for {documentType || 'Document'}
      </div>
      
      <ScrollArea className="h-40 bg-background/30 rounded-md">
        <div className="space-y-3 p-1">
          {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => {
            const CategoryIcon = getCategoryIcon(category);
            
            return (
              <div key={category} className="space-y-2">
                <div className="flex items-center gap-1">
                  <CategoryIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground capitalize">
                    {category}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 gap-1">
                  {categoryTemplates.slice(0, 2).map((template) => {
                    const IconComponent = template.icon;
                    
                    return (
                      <Button
                        key={template.id}
                        variant="outline"
                        size="sm"
                        onClick={() => onSelectTemplate(template.question)}
                        className="h-auto p-2 text-left justify-start group hover:bg-accent/50 bg-background/50 border-muted"
                      >
                        <div className="flex items-start gap-2 w-full">
                          <IconComponent className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-xs group-hover:text-primary transition-colors truncate">
                              {template.title}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {template.description}
                            </div>
                          </div>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${getCategoryColor(template.category)} shrink-0`}
                          >
                            {template.category}
                          </Badge>
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      
      <div className="text-xs text-muted-foreground text-center">
        Click any question above or type your own
      </div>
    </div>
  );
}