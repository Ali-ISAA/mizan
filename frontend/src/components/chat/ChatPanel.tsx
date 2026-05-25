import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ChatInterface } from './ChatInterface';

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[420px] sm:w-[480px] p-0 flex flex-col gap-0"
      >
        <ChatInterface open={open} onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}
