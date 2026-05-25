import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, RefreshCw, Loader2, X, CheckCircle2,
  Search, FileText, BarChart2, List, AlignLeft,
  ChevronDown, Check,
} from 'lucide-react';
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

interface DocumentOption {
  id: string;
  name: string;
  file_type?: string;
  latest_comparison_id?: string | null;
  latest_comparison_status?: string | null;
}

interface SelectedCtx {
  docId: string;
  docName: string;
  comparisonId?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8001/api/v1';

const TOOL_ICONS: Record<string, React.ElementType> = {
  mizan_list_documents: List,
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
  const { documentId: urlDocumentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const urlComparisonId = searchParams.get('comparison_id') ?? undefined;

  // ── Document selector state ────────────────────────────────────────────────
  const [docs, setDocs] = useState<DocumentOption[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedCtx, setSelectedCtx] = useState<SelectedCtx | null>(null);
  const docsLoadedRef = useRef(false);

  // Effective context: user selection > URL params > global
  const effectiveDocId = selectedCtx?.docId ?? urlDocumentId;
  const effectiveComparisonId = selectedCtx?.comparisonId ?? urlComparisonId;
  const storageKey = getStorageKey(effectiveDocId, effectiveComparisonId);

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>(() => loadHistory(storageKey));
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>(() =>
    apiToDisplay(loadHistory(storageKey))
  );
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Fetch document list once on first open
  useEffect(() => {
    if (!open || docsLoadedRef.current) return;
    docsLoadedRef.current = true;

    const token = localStorage.getItem('access_token') || '';
    setLoadingDocs(true);
    fetch(`${API_BASE}/documents`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data: DocumentOption[]) => {
        setDocs(data);
        // Auto-select from URL context
        if (urlDocumentId && !selectedCtx) {
          const found = data.find((d) => d.id === urlDocumentId);
          if (found) {
            setSelectedCtx({
              docId: found.id,
              docName: found.name,
              comparisonId: urlComparisonId || found.latest_comparison_id || undefined,
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload history when context changes
  useEffect(() => {
    const saved = loadHistory(storageKey);
    setApiMessages(saved);
    setDisplayMessages(apiToDisplay(saved));
  }, [storageKey]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages]);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const selectDoc = (doc: DocumentOption | null) => {
    if (abortRef.current) abortRef.current.abort();
    setIsStreaming(false);

    const newCtx = doc
      ? {
          docId: doc.id,
          docName: doc.name,
          comparisonId: doc.latest_comparison_id || undefined,
        }
      : null;

    setSelectedCtx(newCtx);
    setShowPicker(false);

    // Load history for the new context
    const newKey = getStorageKey(
      newCtx?.docId ?? urlDocumentId,
      newCtx?.comparisonId ?? urlComparisonId
    );
    const saved = loadHistory(newKey);
    setApiMessages(saved);
    setDisplayMessages(apiToDisplay(saved));
  };

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
          document_id: effectiveDocId,
          comparison_id: effectiveComparisonId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
              prev.map((m) => (m.id === assistantId ? { ...m, content: accumulatedContent } : m))
            );
          } else if (type === 'tool_use') {
            const chip: ToolChip = { name: event.name as string, label: event.label as string, done: false };
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, toolChips: [...(m.toolChips || []), chip] } : m
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
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, sources: event.sources as Source[] } : m
              )
            );
          } else if (type === 'error') {
            setDisplayMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, streaming: false, error: event.message as string } : m
              )
            );
          } else if (type === 'done') {
            setDisplayMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
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
  }, [inputValue, isStreaming, apiMessages, effectiveDocId, effectiveComparisonId, storageKey]);

  const clearChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setApiMessages([]);
    setDisplayMessages([]);
    saveHistory(storageKey, []);
    setIsStreaming(false);
  };

  const contextLabel = selectedCtx?.docName ?? (urlDocumentId ? '…' : 'All Documents');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-accent-600" />
          <p className="text-sm font-semibold text-foreground">Mizan AI Assistant</p>
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

      {/* Document selector bar */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-2 text-xs border-b border-border bg-surface hover:bg-surface/70 transition-colors"
        >
          <FileText className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
          <span className="flex-1 text-left truncate text-text-secondary">
            {loadingDocs ? 'Loading…' : <><span className="text-foreground/50">Searching in:</span> <span className="font-medium text-foreground">{contextLabel}</span></>}
          </span>
          {selectedCtx && effectiveComparisonId && (
            <span className="text-[10px] bg-success/15 text-success px-1.5 py-0.5 rounded flex-shrink-0">Analysis</span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 text-text-secondary flex-shrink-0 transition-transform ${showPicker ? 'rotate-180' : ''}`} />
        </button>

        {showPicker && (
          <div className="absolute z-50 top-full left-0 right-0 bg-card border-x border-b border-border shadow-xl rounded-b-lg max-h-64 overflow-y-auto">
            {/* All Documents */}
            <button
              onClick={() => selectDoc(null)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-surface text-left border-b border-border"
            >
              <Search className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
              <span className="flex-1 text-foreground">All Documents</span>
              {!selectedCtx && <Check className="h-3.5 w-3.5 text-accent-600 flex-shrink-0" />}
            </button>

            {docs.length === 0 && !loadingDocs && (
              <p className="px-4 py-3 text-xs text-text-secondary text-center">No documents uploaded yet</p>
            )}

            {docs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => selectDoc(doc)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-surface text-left border-b border-border last:border-0"
              >
                <FileText className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
                <span className="flex-1 truncate text-foreground">{doc.name}</span>
                {doc.latest_comparison_status === 'completed' && (
                  <span className="text-[10px] bg-success/15 text-success px-1.5 py-0.5 rounded flex-shrink-0">Analysis</span>
                )}
                {selectedCtx?.docId === doc.id && <Check className="h-3.5 w-3.5 text-accent-600 flex-shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayMessages.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <Bot className="h-10 w-10 text-text-secondary mx-auto" />
            <p className="text-sm text-text-secondary">
              {selectedCtx
                ? `Ask anything about "${selectedCtx.docName}" or its compliance analysis.`
                : 'Select a document above to scope your questions, or ask anything across all documents.'}
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
                      <Badge key={i} variant="secondary" className="gap-1.5 text-xs py-1 px-2">
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
                    msg.role === 'user' ? 'bg-accent-600 text-white' : 'bg-surface text-foreground'
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
                  <p className="text-xs text-text-secondary px-3 py-1.5 bg-surface border-b border-border font-medium">Sources</p>
                  <div className="divide-y divide-border">
                    {msg.sources.slice(0, 3).map((src, i) => (
                      <div key={i} className="px-3 py-2">
                        <p className="text-xs font-medium text-foreground truncate">{src.document_name}</p>
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{src.text}</p>
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
            placeholder={selectedCtx ? `Ask about ${selectedCtx.docName}…` : 'Ask about compliance…'}
            disabled={isStreaming}
            className="text-sm"
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || isStreaming}
            size="sm"
            className="px-3"
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
