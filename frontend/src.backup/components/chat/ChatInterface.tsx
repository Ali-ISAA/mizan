import { useState, useRef, useEffect } from "react";
import { Send, Bot, RefreshCw, Loader2, X, Minimize2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChatMessage } from "./ChatMessage";
import { ComplianceTemplates } from "./ComplianceTemplates";

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  relatedClause?: number;
  suggestions?: string[];
  confidence?: number;
}

interface ChatInterfaceProps {
  document: {
    id: number;
    name: string;
    type: string;
    status: string;
    clauses: Array<{
      id: number;
      title: string;
      status: string;
      content: string;
      feedback: string;
    }>;
  };
  isMinimized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}

export function ChatInterface({ 
  document, 
  isMinimized, 
  onMinimize, 
  onMaximize, 
  onClose 
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: `Hello! I'm Mizan AI, your compliance assistant. I've analyzed "${document.name}" and I'm ready to help you understand its compliance status, explain clauses, and suggest improvements. What would you like to know?`,
      isUser: false,
      timestamp: new Date(),
      suggestions: [
        "What are the main compliance issues?",
        "Explain the problematic clauses",
        "How can I improve this document?"
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
      // Simulate AI processing
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Generate contextual response based on document and question
      const response = generateComplianceResponse(text, document);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.content,
        isUser: false,
        timestamp: new Date(),
        suggestions: response.suggestions,
        confidence: response.confidence,
        relatedClause: response.relatedClause
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error processing message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateComplianceResponse = (question: string, doc: any) => {
    const lowerQuestion = question.toLowerCase();
    
    // Analyze question type and generate appropriate response
    if (lowerQuestion.includes('compliance') || lowerQuestion.includes('issues')) {
      const criticalClauses = doc.clauses.filter((c: any) => c.status === 'critical');
      const warningClauses = doc.clauses.filter((c: any) => c.status === 'warning');
      
      return {
        content: `Based on my analysis of "${doc.name}", here are the main compliance findings:

**Critical Issues (${criticalClauses.length}):**
${criticalClauses.map((c: any) => `• ${c.title}: ${c.feedback}`).join('\n')}

**Areas Needing Review (${warningClauses.length}):**
${warningClauses.map((c: any) => `• ${c.title}: ${c.feedback}`).join('\n')}

**Overall Assessment:**
${doc.status === 'compliant' ? 'The document meets most compliance requirements with minor areas for improvement.' : 
  doc.status === 'warning' ? 'The document has several areas that need attention to ensure full compliance.' :
  'The document has critical compliance issues that require immediate action.'}`,
        suggestions: [
          "How can I fix the critical issues?",
          "What are the specific legal requirements?",
          "Show me industry best practices"
        ],
        confidence: 0.92,
        relatedClause: criticalClauses[0]?.id
      };
    }

    if (lowerQuestion.includes('improve') || lowerQuestion.includes('fix')) {
      return {
        content: `Here are my specific recommendations to improve compliance for "${doc.name}":

**Priority Actions:**
1. **Data Sharing Clause**: Add specific purposes and legal basis for data sharing to meet GDPR Article 6 requirements
2. **Retention Period**: Specify exact timeframes (e.g., "Personal data will be retained for 2 years after contract termination")
3. **User Rights**: Include complete list of GDPR rights (access, rectification, erasure, portability, restriction)

**Implementation Steps:**
• Review each flagged clause with your legal team
• Update language to be more specific and compliant
• Add necessary safeguards and procedures
• Test the updated document for compliance

**Risk Mitigation:**
Addressing these issues will reduce legal exposure and ensure regulatory compliance, particularly with GDPR and local data protection laws.`,
        suggestions: [
          "Draft specific clause improvements",
          "What legal framework applies?",
          "Timeline for implementing changes?"
        ],
        confidence: 0.88
      };
    }

    if (lowerQuestion.includes('explain') || lowerQuestion.includes('clause')) {
      const clause = doc.clauses.find((c: any) => 
        lowerQuestion.includes(c.title.toLowerCase()) || 
        lowerQuestion.includes('termination') ||
        lowerQuestion.includes('confidentiality')
      );

      if (clause) {
        return {
          content: `Let me explain the **${clause.title}** in simple terms:

**What it says:**
${clause.content}

**What this means:**
${clause.status === 'compliant' ? 
  `This clause is well-written and meets legal requirements. ${clause.feedback}` :
  `This clause has issues that need attention. ${clause.feedback}`}

**Legal Context:**
${clause.title.includes('Termination') ? 
  'Employment termination clauses must provide adequate notice periods and follow local labor laws.' :
  clause.title.includes('Confidentiality') ?
  'Confidentiality agreements must be reasonable in scope and duration to be enforceable.' :
  'This type of clause requires specific legal considerations for enforceability.'}

**Compliance Status:** ${clause.status === 'compliant' ? '✅ Compliant' : clause.status === 'warning' ? '⚠️ Needs Review' : '❌ Critical Issue'}`,
          suggestions: [
            "How to improve this clause?",
            "What are the legal requirements?",
            "Show similar compliant examples"
          ],
          confidence: 0.95,
          relatedClause: clause.id
        };
      }
    }

    // Default response
    return {
      content: `I understand you're asking about "${question}". Based on the document "${doc.name}", I can help you with:

• **Compliance Analysis**: Understanding which parts meet or don't meet legal requirements
• **Risk Assessment**: Identifying potential legal exposures
• **Improvement Suggestions**: Specific recommendations to enhance compliance
• **Clause Explanations**: Breaking down complex legal language into plain English
• **Best Practices**: Industry standards and regulatory guidelines

What specific aspect would you like me to focus on?`,
      suggestions: [
        "Analyze overall compliance",
        "Identify critical risks",
        "Suggest specific improvements"
      ],
      confidence: 0.85
    };
  };

  const clearChat = () => {
    setMessages([{
      id: '1',
      content: `Chat cleared. I'm still here to help with "${document.name}". What would you like to know about its compliance?`,
      isUser: false,
      timestamp: new Date(),
      suggestions: [
        "What are the main compliance issues?",
        "Explain the problematic clauses",
        "How can I improve this document?"
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
              <span className="font-medium text-sm">Mizan AI Assistant</span>
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
            Click to expand and continue our conversation about "{document.name}"
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
              <CardTitle className="text-sm">Mizan AI Assistant</CardTitle>
              <p className="text-xs text-muted-foreground truncate">
                Analyzing: {document.name}
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
              <span>Analyzing document for compliance insights...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Templates Section */}
      {showTemplates && messages.length <= 1 && (
        <div className="p-4 border-t bg-muted/20 dark:bg-muted/10">
          <ComplianceTemplates 
            onSelectTemplate={handleSendMessage}
            documentType={document.type}
          />
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
            placeholder="Ask about compliance issues..."
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