import { Bot, User, Copy, Clock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  relatedClause?: number;
  suggestions?: string[];
  confidence?: number;
}

interface ChatMessageProps {
  message: Message;
  onCopyText: (text: string) => void;
  onSendMessage?: (text: string) => void;
}

export function ChatMessage({ message, onCopyText, onSendMessage }: ChatMessageProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className={`flex gap-3 ${message.isUser ? 'flex-row-reverse' : ''}`}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={message.isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary'}>
          {message.isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={`flex-1 space-y-2 ${message.isUser ? 'text-right' : ''}`}>
        {/* Message Header */}
        <div className={`flex items-center gap-2 ${message.isUser ? 'justify-end' : ''}`}>
          <span className="text-sm font-medium">
            {message.isUser ? 'You' : 'Mizan AI'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
          {!message.isUser && (
            <>
              {message.confidence && (
                <Badge variant="outline" className="text-xs">
                  <Target className="h-3 w-3 mr-1" />
                  {Math.round(message.confidence * 100)}%
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCopyText(message.content)}
                className="h-6 w-6 p-0"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>

        {/* Message Content */}
        <Card className={`${
          message.isUser 
            ? 'bg-primary text-primary-foreground ml-8' 
            : 'bg-muted/50 mr-8 border-muted'
        }`}>
          <CardContent className="p-3">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {message.content}
            </div>

            {/* Related Clause Indicator */}
            {!message.isUser && message.relatedClause && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Related to Clause {message.relatedClause}</span>
                </div>
              </div>
            )}

            {/* Suggested Follow-up Questions */}
            {!message.isUser && message.suggestions && message.suggestions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="text-xs text-muted-foreground mb-2">Suggested questions:</div>
                <div className="space-y-1">
                  {message.suggestions.map((suggestion, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => onSendMessage?.(suggestion)}
                      className="text-xs h-7 justify-start w-full"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}