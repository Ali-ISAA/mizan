import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, RefreshCw, Loader2, X, CheckCircle2, Search, FileText, BarChart2, List, AlignLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useParams, useSearchParams } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolChip {
  name: string;
  label: string;
  done: boolean;
}

interface Source {
  text: string;
  document_name: string;
  score: number;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  toolChips?: ToolChip[];
  sources?: Source[];
  error?: string;
}

interface ApiMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface StoredHistory {
  messages: ApiMessage[];
  updatedAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8001/api/v1';

const TOOL_ICONS: Record<string, React.ElementType> = {
  mizan_search: Search,
  mizan_get_document_info: FileText,
  mizan_get_articles: List,
  mizan_get_article_detail: AlignLeft,
  mizan_get_compliance_findings: BarChart2,
  mizan_get_compliance_report: BarChart2,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStorageKey(documentId?: string, comparisonId?: string): string {
  if (comparisonId) return `mizan-chat-v1-comparison-${comparisonId}`;
  if (documentId) return `mizan-chat-v1-doc-${documentId}`;
  return 'mizan-chat-v1-global';
}

function loadHistory(key: string): ApiMessage[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const stored: StoredHistory = JSON.parse(raw);
    return stored.messages || [];
  } catch {
    return [];
  }
}

function saveHistory(key: string, messages: ApiMessage[]): void {
  try {
    const stored: StoredHistory = { messages, updatedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // localStorage quota exceeded — ignore
  }
}

function apiToDisplay(apiMessages: ApiMessage[]): DisplayMessage[] {
  const display: DisplayMessage[] = [];
  for (const m of apiMessages) {
    if (m.role === 'user') {
      display.push({ id: Math.random().toString(36).slice(2), role: 'user', content: m.content || '' });
    } else if (m.role === 'assistant' && m.content) {
      display.push({ id: Math.random().toString(36).slice(2), role: 'assistant', content: m.content });
    }
  }
  return display;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
  open: boolean;
  onClose: () => void;
}

export function ChatInterface({ open, onClose }: ChatInterfaceProps) {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const comparisonId = searchParams.get('comparison_id') ?? undefined;

  const storageKey = getStorageKey(documentId, comparisonId);

  const [apiMessages, setApiMessages] = useState<ApiMessage[]>(() => loadHistory(storageKey));
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>(() =>
    apiToDisplay(loadHistory(storageKey))
  );
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = loadHistory(storageKey);
    setApiMessages(saved);
    setDisplayMessages(apiToDisplay(saved));
  }, [storageKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages]);

  const sendMessage = useCallback(async (text?: string) => {
    const messageText = text || inputValue;
    if (!messageText.trim() || isStreaming) return;

    setInputValue('');

    const userDisplay: DisplayMessage = {
      id: Math.random().toString(36).slice(2),
      role: 'user',
      content: messageText,
    };
    const userApi: ApiMessage = { role: 'user', content: messageText };

    const newApiMessages = [...apiMessages, userApi];
    setApiMessages(newApiMessages);
    setDisplayMessages((prev) => [...prev, userDisplay]);

    const assistantId = Math.random().toString(36).slice(2);
    setDisplayMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', streaming: true, toolChips: [] },
    ]);

    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const token = localStorage.getItem('access_token') || '';

    try {
      const response = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newApiMessages,
          document_id: documentId,
          comparison_id: comparisonId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          const type = event.type as string;

          if (type === 'token') {
            accumulatedContent += event.content as string;
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulatedContent } : m
              )
            );
          } else if (type === 'tool_use') {
            const chip: ToolChip = {
              name: event.name as string,
              label: event.label as string,
              done: false,
            };
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, toolChips: [...(m.toolChips || []), chip] }
                  : m
              )
            );
          } else if (type === 'tool_done') {
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolChips: (m.toolChips || []).map((c) =>
                        c.name === (event.name as string) ? { ...c, done: true } : c
                      ),
                    }
                  : m
              )
            );
          } else if (type === 'sources') {
            const finalSources = event.sources as Source[];
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, sources: finalSources } : m
              )
            );
          } else if (type === 'error') {
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, streaming: false, error: event.message as string }
                  : m
              )
            );
          } else if (type === 'done') {
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, streaming: false } : m
              )
            );
            const assistantApi: ApiMessage = { role: 'assistant', content: accumulatedContent };
            const savedMessages = [...newApiMessages, assistantApi];
            setApiMessages(savedMessages);
            saveHistory(storageKey, savedMessages);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setDisplayMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, streaming: false, error: 'Connection failed. Please try again.' }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [inputValue, isStreaming, apiMessages, documentId, comparisonId, storageKey]);

  const clearChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setApiMessages([]);
    setDisplayMessages([]);
    saveHistory(storageKey, []);
    setIsStreaming(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-accent-600" />
          <div>
            <p className="text-sm font-semibold text-foreground">Mizan AI Assistant</p>
            {comparisonId && (
              <p className="text-xs text-text-secondary">Compliance analysis context active</p>
            )}
            {documentId && !comparisonId && (
              <p className="text-xs text-text-secondary">Document context active</p>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={clearChat} className="h-7 w-7 p-0" title="Clear chat">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayMessages.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <Bot className="h-10 w-10 text-text-secondary mx-auto" />
            <p className="text-sm text-text-secondary">
              Ask me anything about your compliance documents, regulation articles, or analysis findings.
            </p>
          </div>
        )}

        {displayMessages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="h-7 w-7 rounded-full bg-accent-600/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-accent-600" />
              </div>
            )}

            <div className={`flex-1 max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
              {/* Tool chips */}
              {msg.toolChips && msg.toolChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.toolChips.map((chip, i) => {
                    const Icon = TOOL_ICONS[chip.name] || Search;
                    return (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="gap-1.5 text-xs py-1 px-2"
                      >
                        {chip.done ? (
                          <CheckCircle2 className="h-3 w-3 text-success" />
                        ) : (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        <Icon className="h-3 w-3" />
                        {chip.label}
                      </Badge>
                    );
                  })}
                </div>
              )}

              {/* Message bubble */}
              {(msg.content || msg.streaming) && (
                <div
                  className={`rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-accent-600 text-white'
                      : 'bg-surface text-foreground'
                  }`}
                >
                  {msg.content}
                  {msg.streaming && !msg.content && (
                    <span className="inline-flex gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </div>
              )}

              {/* Error */}
              {msg.error && (
                <div className="rounded-xl px-3 py-2 text-sm bg-critical/10 text-critical">
                  {msg.error}
                </div>
              )}

              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <p className="text-xs text-text-secondary px-3 py-1.5 bg-surface border-b border-border font-medium">
                    Sources
                  </p>
                  <div className="divide-y divide-border">
                    {msg.sources.slice(0, 3).map((src, i) => (
                      <div key={i} className="px-3 py-2">
                        <p className="text-xs font-medium text-foreground truncate">
                          {src.document_name}
                        </p>
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                          {src.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about compliance..."
            disabled={isStreaming}
            className="text-sm"
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || isStreaming}
            size="sm"
            className="px-3"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
