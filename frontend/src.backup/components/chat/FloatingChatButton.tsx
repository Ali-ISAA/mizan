import { useState } from "react";
import { MessageCircle, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FloatingChatButtonProps {
  className?: string;
  onOpenChat?: () => void;
  showNotification?: boolean;
  notificationCount?: number;
}

export function FloatingChatButton({ 
  className, 
  onOpenChat, 
  showNotification = false,
  notificationCount = 0
}: FloatingChatButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className={cn("fixed bottom-6 right-6 z-50", className)}>
      {/* Tooltip Card */}
      {isHovered && (
        <Card className="absolute bottom-16 right-0 w-80 shadow-xl border-primary/20 animate-in slide-in-from-bottom-2 duration-200 bg-background">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Mizan AI Compliance Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-3">
              Get instant help with compliance questions, document analysis, and legal guidance.
            </p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary" className="text-xs">Legal Analysis</Badge>
              <Badge variant="secondary" className="text-xs">GDPR</Badge>
              <Badge variant="secondary" className="text-xs">Saudi Law</Badge>
              <Badge variant="secondary" className="text-xs">Risk Assessment</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chat Button */}
      <Button
        onClick={onOpenChat}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        size="lg"
        className="relative h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-primary hover:bg-primary/90 hover:scale-105"
      >
        <MessageCircle className="h-6 w-6" />
        
        {/* Notification Badge */}
        {showNotification && notificationCount > 0 && (
          <Badge className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-xs">
            {notificationCount > 99 ? '99+' : notificationCount}
          </Badge>
        )}

        {/* Pulse Animation for Active State */}
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
      </Button>
    </div>
  );
}
