import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProjects, useCreateProject, useDeleteProject } from '@/hooks/useProjects';

export default function Projects() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: projects = [], isLoading } = useProjects();
  const createMutation = useCreateProject();
  const deleteMutation = useDeleteProject();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({ name, description: description || undefined });
      setName('');
      setDescription('');
      setShowCreate(false);
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleDelete = (projectId: string) => {
    if (window.confirm('Are you sure?')) {
      deleteMutation.mutate(projectId);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-success/10 text-success';
      case 'processing':
        return 'bg-warning/10 text-warning';
      case 'failed':
        return 'bg-critical/10 text-critical';
      default:
        return 'bg-text-muted/10 text-text-muted';
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-text-muted';
    if (score >= 80) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-critical';
  };

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-text-secondary mt-2">Manage your compliance analyses</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {showCreate && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Create New Project</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Project Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., ISO 27001 Audit"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description (optional)</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the analysis"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <p className="text-text-secondary">Loading projects...</p>
      ) : projects.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderOpen className="h-12 w-12 mx-auto mb-4 text-text-muted" />
          <h3 className="font-semibold text-lg">No projects yet</h3>
          <p className="text-text-secondary mt-2">Create your first project to start analyzing compliance</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
              <Link
                to={project.status === 'complete' ? `/projects/${project.id}/results` : `/projects/${project.id}`}
                className="flex items-center gap-4 flex-1"
              >
                <FolderOpen className="h-5 w-5 text-text-muted" />
                <div className="flex-1">
                  <h3 className="font-semibold">{project.name}</h3>
                  {project.description && <p className="text-sm text-text-secondary">{project.description}</p>}
                </div>
              </Link>
              <div className="flex items-center gap-3">
                {project.overall_score !== null && (
                  <span className={`text-lg font-semibold ${getScoreColor(project.overall_score)}`}>
                    {project.overall_score.toFixed(1)}%
                  </span>
                )}
                <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                <button
                  onClick={() => handleDelete(project.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 hover:bg-critical/10 rounded transition-all"
                >
                  <Trash2 className="h-4 w-4 text-critical" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
