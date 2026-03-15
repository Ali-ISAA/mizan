import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, FileText, Play, Upload } from "lucide-react";
import { api } from "../lib/api";

interface Project { id: string; name: string; description: string | null; status: string; overall_score: number | null; }
interface Doc { id: string; role: string; name: string; processing_status: string; page_count: number | null; word_count: number | null; }

function ProcessingStatus({ status }: { status: string }) {
  const map: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
    pending: { icon: Clock, color: "text-slate-500", label: "Pending" },
    processing: { icon: Clock, color: "text-blue-500", label: "Processing..." },
    completed: { icon: CheckCircle2, color: "text-green-500", label: "Ready" },
    failed: { icon: AlertCircle, color: "text-red-500", label: "Failed" },
  };
  const { icon: Icon, color, label } = map[status] || map.pending;
  return <span className={`flex items-center gap-1 text-xs ${color}`}><Icon className="h-3.5 w-3.5" />{label}</span>;
}

function UploadZone({ role, label, doc, onUpload }: { role: string; label: string; doc: Doc | undefined; onUpload: (role: string, file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const desc = role === "requirement" ? "Upload the requirements, policies, or RFP document" : "Upload the compliance response or organization document";

  return (
    <div className={`border-2 border-dashed rounded-lg p-6 text-center space-y-3 ${doc ? "border-green-200 bg-green-50/30" : "border-border hover:border-primary/50"} transition-colors`}>
      <div className="flex flex-col items-center gap-2">
        <FileText className={`h-8 w-8 ${doc ? "text-green-500" : "text-muted-foreground"}`} />
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {doc ? (
        <div className="space-y-1">
          <p className="text-sm font-medium truncate max-w-xs mx-auto">{doc.name}</p>
          {doc.page_count && <p className="text-xs text-muted-foreground">{doc.page_count} pages{doc.word_count ? ` · ${doc.word_count.toLocaleString()} words` : ""}</p>}
          <ProcessingStatus status={doc.processing_status} />
          <button onClick={() => ref.current?.click()} className="text-xs text-primary hover:underline mt-1">Replace</button>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()} className="flex items-center gap-2 mx-auto bg-primary text-primary-foreground rounded px-3 py-1.5 text-xs font-medium hover:bg-primary/90">
          <Upload className="h-3.5 w-3.5" /> Choose file
        </button>
      )}
      <input ref={ref} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={e => e.target.files?.[0] && onUpload(role, e.target.files[0])} />
    </div>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then(r => r.data),
    refetchInterval: 3000,
  });

  const { data: docs = [] } = useQuery<Doc[]>({
    queryKey: ["docs", projectId],
    queryFn: () => api.get(`/projects/${projectId}/documents`).then(r => r.data),
    refetchInterval: 3000,
  });

  const docA = docs.find(d => d.role === "requirement");
  const docB = docs.find(d => d.role === "compliance");
  const bothReady = docA?.processing_status === "completed" && docB?.processing_status === "completed";
  const isAnalyzing = project?.status === "processing";

  // Redirect when analysis is complete
  useEffect(() => {
    if (project?.status === "complete") navigate(`/projects/${projectId}/results`);
  }, [project?.status]);

  const uploadMutation = useMutation({
    mutationFn: async ({ role, file }: { role: string; file: File }) => {
      const fd = new FormData();
      fd.append("role", role);
      fd.append("file", file);
      return api.post(`/projects/${projectId}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["docs", projectId] }),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/analyze`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", projectId] }),
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{project?.name || "Loading..."}</h1>
        {project?.description && <p className="text-muted-foreground text-sm mt-1">{project.description}</p>}
      </div>

      {/* Upload zones */}
      <div>
        <h2 className="text-base font-semibold mb-3">Documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UploadZone role="requirement" label="Requirements / Policy Document" doc={docA} onUpload={(role, file) => uploadMutation.mutate({ role, file })} />
          <UploadZone role="compliance" label="Compliance / Response Document" doc={docB} onUpload={(role, file) => uploadMutation.mutate({ role, file })} />
        </div>
      </div>

      {/* Analysis trigger */}
      <div className="border rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Run Compliance Analysis</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {!bothReady ? "Both documents must be uploaded and processed" : isAnalyzing ? "Analysis in progress..." : "Documents ready — start analysis"}
          </p>
        </div>
        <button
          onClick={() => analyzeMutation.mutate()}
          disabled={!bothReady || isAnalyzing || analyzeMutation.isPending}
          className="flex items-center gap-2 bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {isAnalyzing ? <Clock className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {isAnalyzing ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {project?.status === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Analysis failed. Check that both documents were processed successfully and try again.
        </div>
      )}
    </div>
  );
}
