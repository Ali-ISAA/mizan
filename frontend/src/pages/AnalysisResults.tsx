import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, MessageSquare, MinusCircle, XCircle } from "lucide-react";
import { api } from "../lib/api";

interface AnalysisOut { id: string; overall_score: number | null; requirements_count: number; met_count: number; partial_count: number; not_met_count: number; critical_gaps: number; major_gaps: number; minor_gaps: number; executive_summary: string | null; }
interface RequirementOut { id: string; requirement_text: string; section_ref: string | null; compliance_status: string; confidence_score: number | null; order_index: number; mapping: { matched_clause_text: string | null; ai_commentary: string | null; match_score: number | null; } | null; }
interface GapOut { id: string; gap_description: string; severity: string; recommendation: string | null; order_index: number; }

function ScoreGauge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color = score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <div className="-mt-16 text-center">
        <p className="text-3xl font-bold" style={{ color }}>{score.toFixed(1)}%</p>
        <p className="text-xs text-muted-foreground">Compliance Score</p>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "met") return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  if (status === "partial") return <MinusCircle className="h-4 w-4 text-yellow-500 shrink-0" />;
  return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = { critical: "bg-red-100 text-red-700", major: "bg-orange-100 text-orange-700", minor: "bg-yellow-100 text-yellow-700" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[severity] || map.major}`}>{severity}</span>;
}

type Tab = "summary" | "requirements" | "gaps" | "chat";

export default function AnalysisResults() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState<Tab>("summary");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const { data: analysis } = useQuery<AnalysisOut>({ queryKey: ["analysis", projectId], queryFn: () => api.get(`/projects/${projectId}/analysis`).then(r => r.data) });
  const { data: requirements = [] } = useQuery<RequirementOut[]>({ queryKey: ["requirements", projectId], queryFn: () => api.get(`/projects/${projectId}/requirements`).then(r => r.data), enabled: tab === "requirements" });
  const { data: gaps = [] } = useQuery<GapOut[]>({ queryKey: ["gaps", projectId], queryFn: () => api.get(`/projects/${projectId}/gaps`).then(r => r.data), enabled: tab === "gaps" });

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: "user", content: chatInput };
    setChatMessages(m => [...m, userMsg]);
    setChatInput("");
    setChatLoading(true);
    try {
      const resp = await fetch(`${api.defaults.baseURL}/projects/${projectId}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token")}` },
        body: JSON.stringify({ messages: [...chatMessages, userMsg] }),
      });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setChatMessages(m => [...m, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const { token } = JSON.parse(line.slice(6));
              assistantText += token;
              setChatMessages(m => [...m.slice(0, -1), { role: "assistant", content: assistantText }]);
            } catch {}
          }
        }
      }
    } catch (e) { console.error(e); }
    finally { setChatLoading(false); }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "summary", label: "Summary" },
    { id: "requirements", label: `Requirements (${analysis?.requirements_count ?? 0})` },
    { id: "gaps", label: `Gaps (${(analysis?.critical_gaps ?? 0) + (analysis?.major_gaps ?? 0) + (analysis?.minor_gaps ?? 0)})` },
    { id: "chat", label: "AI Chat" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={`/projects/${projectId}`} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="text-2xl font-bold flex-1">Analysis Results</h1>
        <div className="flex gap-2">
          <a href={`${api.defaults.baseURL}/projects/${projectId}/report?format=json`} download className="flex items-center gap-1.5 border rounded px-3 py-1.5 text-sm hover:bg-accent">
            <Download className="h-4 w-4" /> JSON
          </a>
          <a href={`${api.defaults.baseURL}/projects/${projectId}/report?format=pdf`} download className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm hover:bg-primary/90">
            <Download className="h-4 w-4" /> PDF
          </a>
        </div>
      </div>

      {/* Score + stats row */}
      {analysis && (
        <div className="bg-card border rounded-lg p-6 flex flex-col sm:flex-row items-center gap-6">
          <ScoreGauge score={analysis.overall_score} />
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: "Requirements", value: analysis.requirements_count, color: "text-foreground" },
              { label: "Met", value: analysis.met_count, color: "text-green-600" },
              { label: "Partial", value: analysis.partial_count, color: "text-yellow-600" },
              { label: "Not Met", value: analysis.not_met_count, color: "text-red-600" },
              { label: "Critical Gaps", value: analysis.critical_gaps, color: "text-red-700" },
              { label: "Major Gaps", value: analysis.major_gaps, color: "text-orange-600" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div>
        <div className="flex border-b gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="pt-4">
          {/* Summary tab */}
          {tab === "summary" && (
            <div className="space-y-4">
              {analysis?.executive_summary && (
                <div className="bg-card border rounded-lg p-4">
                  <h3 className="font-medium mb-2">Executive Summary</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{analysis.executive_summary}</p>
                </div>
              )}
            </div>
          )}

          {/* Requirements tab */}
          {tab === "requirements" && (
            <div className="space-y-2">
              {requirements.map(req => (
                <div key={req.id} className="bg-card border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <StatusIcon status={req.compliance_status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {req.section_ref && <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">{req.section_ref}</span>}
                        <span className="text-xs text-muted-foreground">{(req.confidence_score != null ? (req.confidence_score * 100).toFixed(0) : "—")}% confidence</span>
                      </div>
                      <p className="text-sm">{req.requirement_text}</p>
                      {req.mapping?.ai_commentary && (
                        <p className="text-xs text-muted-foreground mt-2 italic">{req.mapping.ai_commentary}</p>
                      )}
                      {req.mapping?.matched_clause_text && (
                        <details className="mt-2">
                          <summary className="text-xs text-primary cursor-pointer">View matched clause</summary>
                          <p className="text-xs text-muted-foreground mt-1 border-l-2 border-primary/30 pl-2">{req.mapping.matched_clause_text}</p>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Gaps tab */}
          {tab === "gaps" && (
            <div className="space-y-2">
              {gaps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p className="font-medium">No gaps found</p>
                  <p className="text-sm">All requirements are met</p>
                </div>
              ) : gaps.map(gap => (
                <div key={gap.id} className="bg-card border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                      <SeverityBadge severity={gap.severity} />
                    </div>
                  </div>
                  <p className="text-sm">{gap.gap_description}</p>
                  {gap.recommendation && (
                    <p className="text-xs text-muted-foreground border-t pt-2"><span className="font-medium">Recommendation:</span> {gap.recommendation}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Chat tab */}
          {tab === "chat" && (
            <div className="flex flex-col h-[500px] border rounded-lg overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Ask questions about the compliance analysis</p>
                    <div className="flex flex-wrap gap-2 justify-center mt-3">
                      {["What are the critical gaps?", "Summarize the compliance status", "Which requirements are not met?"].map(q => (
                        <button key={q} onClick={() => setChatInput(q)} className="text-xs border rounded-full px-3 py-1 hover:bg-accent">{q}</button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t p-3 flex gap-2">
                <input
                  className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Ask about the compliance analysis..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                />
                <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
