import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";

interface Project {
  id: string; name: string; description: string | null; status: string; overall_score: number | null; requirements_count: number; created_at: string;
}

function ScoreBadge({ score, status }: { score: number | null; status: string }) {
  if (status === "processing") return <span className="text-xs text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">Analyzing...</span>;
  if (status === "pending") return <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">Pending</span>;
  if (status === "failed") return <span className="text-xs text-red-600 bg-red-50 rounded-full px-2 py-0.5">Failed</span>;
  if (score === null) return null;
  const color = score >= 80 ? "text-green-700 bg-green-50" : score >= 50 ? "text-yellow-700 bg-yellow-50" : "text-red-700 bg-red-50";
  return <span className={`text-sm font-bold rounded-full px-2 py-0.5 ${color}`}>{score.toFixed(1)}%</span>;
}

export default function Projects() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects").then(r => r.data),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => api.post("/projects", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setShowCreate(false); setName(""); setDescription(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-card border rounded-lg p-4 space-y-3">
          <h3 className="font-medium">New Project</h3>
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Project name" value={name} onChange={e => setName(e.target.value)} />
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate({ name, description: description || undefined })} disabled={!name || createMutation.isPending} className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
            <button onClick={() => setShowCreate(false)} className="border rounded px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Projects list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : projects.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No projects yet</p>
          <p className="text-sm">Create a project to start analyzing compliance</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map(p => (
            <div key={p.id} className="bg-card border rounded-lg p-4 flex items-center justify-between group hover:shadow-sm transition-shadow">
              <Link to={p.status === "complete" ? `/projects/${p.id}/results` : `/projects/${p.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                  <p className="text-xs text-muted-foreground">{p.requirements_count} requirements</p>
                </div>
              </Link>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                <ScoreBadge score={p.overall_score} status={p.status} />
                <button onClick={() => deleteMutation.mutate(p.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
