import { useState, useRef, useEffect } from "react";
import { Send, Bot, RefreshCw, Loader2, X, Minimize2, Maximize2, Scale, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChatMessage } from "./ChatMessage";
import { Message } from "./types";

interface GeneralChatInterfaceProps {
  isMinimized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  title?: string;
  context?: string;
}

const generalTemplates = [
  {
    id: '1',
    title: 'Document Upload Guidance',
    question: 'What types of documents should I upload for compliance analysis?',
    icon: FileText
  },
  {
    id: '2',
    title: 'Compliance Overview',
    question: 'What compliance frameworks does Mizan support?',
    icon: Scale
  },
  {
    id: '3',
    title: 'Risk Assessment',
    question: 'How can I identify potential compliance risks in my organization?',
    icon: AlertTriangle
  },
  {
    id: '4',
    title: 'GDPR Requirements',
    question: 'What are the key GDPR requirements I need to know about?',
    icon: Scale
  },
  {
    id: '5',
    title: 'Saudi Regulations',
    question: 'What Saudi Arabian regulations should my business comply with?',
    icon: Scale
  },
  {
    id: '6',
    title: 'Best Practices',
    question: 'What are the compliance best practices for my industry?',
    icon: FileText
  }
];

export function GeneralChatInterface({ 
  isMinimized, 
  onMinimize, 
  onMaximize, 
  onClose,
  title = "Mizan AI Assistant",
  context = "general"
}: GeneralChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: `Hello! I'm Mizan AI, your compliance assistant. I can help you with:

• **Compliance Guidance** - Understanding regulations and requirements
• **Document Analysis** - Best practices for legal document review  
• **Risk Assessment** - Identifying potential compliance issues
• **Industry Standards** - Learning about sector-specific regulations
• **GDPR & Data Protection** - Privacy and data handling requirements
• **Saudi Arabian Law** - Local regulatory compliance

What would you like to know about compliance today?`,
      isUser: false,
      timestamp: new Date(),
      suggestions: [
        "What compliance frameworks do you support?",
        "How do I assess compliance risks?",
        "Explain GDPR requirements"
      ]
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || inputValue;
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: text,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setShowTemplates(false);

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));

      const response = generateGeneralResponse(text);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.content,
        isUser: false,
        timestamp: new Date(),
        suggestions: response.suggestions,
        confidence: response.confidence
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error processing message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateGeneralResponse = (question: string) => {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('gdpr') || lowerQuestion.includes('data protection')) {
      return {
        content: `GDPR (General Data Protection Regulation) is a comprehensive data protection law. Here are the key requirements:

**Core Principles:**
• **Lawfulness** - Data processing must have a legal basis
• **Purpose Limitation** - Data collected for specific, legitimate purposes
• **Data Minimization** - Only collect data that's necessary
• **Accuracy** - Keep data accurate and up-to-date
• **Storage Limitation** - Don't keep data longer than necessary
• **Security** - Implement appropriate technical and organizational measures

**Individual Rights:**
• Right to access personal data
• Right to rectification (correction)
• Right to erasure ("right to be forgotten")
• Right to data portability
• Right to object to processing

**Compliance Requirements:**
• Obtain valid consent when required
• Conduct Data Protection Impact Assessments (DPIAs)
• Appoint a Data Protection Officer if required
• Report data breaches within 72 hours
• Implement privacy by design and default`,
        suggestions: [
          "How do I conduct a DPIA?",
          "What constitutes valid consent?",
          "GDPR penalties and enforcement"
        ],
        confidence: 0.95
      };
    }

    if (lowerQuestion.includes('saudi') || lowerQuestion.includes('ksa') || lowerQuestion.includes('kingdom')) {
      return {
        content: `Saudi Arabian businesses must comply with several key regulatory frameworks:

**Labor Law Compliance:**
• Saudi Labor Law governs employment relationships
• Working hours: Maximum 8 hours/day, 48 hours/week
• Probation periods: Maximum 90 days
• End of service benefits (gratuity) calculations
• Minimum wage requirements

**Data Protection:**
• Personal Data Protection Law (PDPL) - Saudi's GDPR equivalent
• Data localization requirements for government data
• Cross-border data transfer restrictions

**Financial Regulations:**
• SAMA (Saudi Arabian Monetary Authority) for banking
• CMA (Capital Market Authority) for securities
• Anti-money laundering (AML) requirements

**Industry-Specific:**
• CITC for telecommunications
• SFDA for food and drug
• Ministry of Commerce for commercial activities

**Key Compliance Areas:**
• Saudization (Nitaqat) employment quotas
• Zakat and tax obligations
• Commercial registration requirements
• Import/export regulations`,
        suggestions: [
          "Explain Saudi Labor Law details",
          "PDPL vs GDPR differences",
          "Saudization requirements"
        ],
        confidence: 0.92
      };
    }

    if (lowerQuestion.includes('framework') || lowerQuestion.includes('support')) {
      return {
        content: `Mizan supports analysis for multiple compliance frameworks:

**Data Protection & Privacy:**
• GDPR (General Data Protection Regulation)
• PDPL (Personal Data Protection Law - KSA)
• CCPA (California Consumer Privacy Act)
• ISO 27001 Security Standards

**Financial Services:**
• SAMA Banking Regulations (Saudi Arabia)
• CMA Securities Regulations (Saudi Arabia)
• Basel III Banking Standards
• Sarbanes-Oxley (SOX) Act

**Employment & Labor:**
• Saudi Labor Law
• International Labor Organization (ILO) Standards
• Workplace Safety Regulations

**Industry Standards:**
• ISO 9001 Quality Management
• ISO 14001 Environmental Management
• NIST Cybersecurity Framework
• SOC 2 Compliance

**Legal Document Types:**
• Employment contracts
• Privacy policies
• Terms of service
• Vendor agreements
• Data processing agreements
• Disclosure policies

The system analyzes your documents against applicable regulations and provides specific, actionable recommendations.`,
        suggestions: [
          "How accurate is the analysis?",
          "Can I customize compliance rules?",
          "What file formats are supported?"
        ],
        confidence: 0.88
      };
    }

    if (lowerQuestion.includes('risk') || lowerQuestion.includes('assess')) {
      return {
        content: `Here's how to conduct a comprehensive compliance risk assessment:

**1. Identify Applicable Regulations**
• Map your business activities to relevant laws
• Consider industry-specific requirements
• Include cross-border obligations

**2. Document Review Process**
• Inventory all legal documents and policies
• Categorize by risk level and importance
• Set up regular review schedules

**3. Risk Assessment Matrix**
• **High Risk**: Critical legal exposures, regulatory violations
• **Medium Risk**: Unclear language, missing clauses
• **Low Risk**: Minor formatting or procedural issues

**4. Common Risk Areas**
• Data handling and privacy practices
• Employment terms and conditions
• Intellectual property protection
• Liability and indemnification clauses
• Dispute resolution mechanisms

**5. Mitigation Strategies**
• Regular compliance audits
• Staff training programs
• Legal document updates
• Monitoring regulatory changes
• Incident response procedures

**Tools and Techniques:**
• Automated document analysis (like Mizan)
• Legal compliance checklists
• Third-party risk assessments
• Regular legal consultations`,
        suggestions: [
          "Create a compliance checklist",
          "How often should I review documents?",
          "What are red flag indicators?"
        ],
        confidence: 0.90
      };
    }

    // Default response
    return {
      content: `I'm here to help with compliance questions! I can assist you with:

**Document Analysis & Review**
• Contract compliance checking
• Policy gap analysis  
• Risk identification
• Legal requirement mapping

**Regulatory Guidance**
• GDPR and data protection laws
• Saudi Arabian regulations
• Industry-specific standards
• International compliance frameworks

**Best Practices**
• Document templates and examples
• Compliance program development
• Risk mitigation strategies
• Training and awareness

**Specific Areas of Expertise**
• Employment and labor law
• Data privacy and security
• Financial services compliance
• Commercial agreements

What specific compliance topic would you like to explore?`,
      suggestions: [
        "Analyze my compliance program",
        "Explain specific regulations",
        "Review document requirements"
      ],
      confidence: 0.85
    };
  };

  const clearChat = () => {
    setMessages([{
      id: '1',
      content: "Chat cleared. I'm here to help with any compliance questions you have!",
      isUser: false,
      timestamp: new Date(),
      suggestions: [
        "What compliance frameworks do you support?",
        "How do I assess compliance risks?",
        "Explain GDPR requirements"
      ]
    }]);
    setShowTemplates(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (isMinimized) {
    return (
      <Card className="fixed bottom-4 right-4 w-80 shadow-lg border-2 border-primary/20 bg-background">
        <CardHeader className="p-3 cursor-pointer" onClick={onMaximize}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">{title}</span>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onMaximize(); }} className="h-6 w-6 p-0">
                <Maximize2 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onClose(); }} className="h-6 w-6 p-0">
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <p className="text-xs text-muted-foreground">
            Click to expand and ask me about compliance topics
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-96 h-[600px] shadow-xl border-2 border-primary/20 flex flex-col bg-background">
      {/* Header */}
      <CardHeader className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-sm">{title}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Compliance guidance and support
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={clearChat} className="h-7 w-7 p-0">
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onMinimize} className="h-7 w-7 p-0">
              <Minimize2 className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage 
              key={message.id} 
              message={message} 
              onCopyText={copyToClipboard}
              onSendMessage={handleSendMessage}
            />
          ))}
          
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Thinking about your compliance question...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Quick Templates */}
      {showTemplates && messages.length <= 1 && (
        <div className="p-4 border-t bg-muted/20 dark:bg-muted/10">
          <div className="text-xs font-medium text-muted-foreground mb-2">Quick Questions:</div>
          <div className="space-y-1">
            {generalTemplates.slice(0, 3).map((template) => {
              const IconComponent = template.icon;
              return (
                <Button
                  key={template.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendMessage(template.question)}
                  className="w-full justify-start text-xs h-auto p-2 bg-background/50 hover:bg-accent"
                >
                  <IconComponent className="h-3 w-3 mr-2 shrink-0" />
                  <span className="truncate">{template.title}</span>
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask about compliance..."
            disabled={isLoading}
            className="text-sm"
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isLoading}
            size="sm"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}