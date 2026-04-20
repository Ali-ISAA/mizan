import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, FileText, Play, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useProject } from '@/hooks/useProject';
import { useProjectDocuments, useUploadDocument, useAnalyze } from '@/hooks/useDocuments';

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const requirementInputRef = useRef<HTMLInputElement>(null);
  const complianceInputRef = useRef<HTMLInputElement>(null);

  if (!projectId) {
    return <div>Project not found</div>;
  }

  const { data: project } = useProject(projectId);
  const { data: documents = [] } = useProjectDocuments(projectId);
  const uploadMutation = useUploadDocument();
  const analyzeMutation = useAnalyze();

  const docA = documents.find((d) => d.role === 'requirement');
  const docB = documents.find((d) => d.role === 'compliance');
  const bothReady = docA?.processing_status === 'completed' && docB?.processing_status === 'completed';

  useEffect(() => {
    if (project?.status === 'complete') {
      navigate(`/projects/${projectId}/results`);
    }
  }, [project?.status, projectId, navigate]);

  const handleFileSelect = (role: string, file: File) => {
    uploadMutation.mutate({ projectId, role, file });
  };

  const handleAnalyze = () => {
    analyzeMutation.mutate(projectId);
  };

  return (
    <div className="flex-1 space-y-6 p-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">{project?.name || 'Loading...'}</h1>
        {project?.description && <p className="text-text-secondary mt-2">{project.description}</p>}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Upload Documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Requirement Document */}
          <Card className="p-6 border-2 border-dashed">
            <div className="text-center">
              <FileText className="h-8 w-8 mx-auto mb-2 text-text-muted" />
              <h3 className="font-semibold">Requirements Document</h3>
              <p className="text-sm text-text-secondary mt-1">
                Upload the policy, RFP, or regulation document
              </p>
            </div>
            {docA ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">{docA.filename}</p>
                <div className="flex items-center gap-2">
                  {docA.processing_status === 'completed' && (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-xs text-success">Ready</span>
                    </>
                  )}
                  {docA.processing_status === 'processing' && (
                    <>
                      <Clock className="h-4 w-4 text-warning animate-spin" />
                      <span className="text-xs text-warning">Processing...</span>
                    </>
                  )}
                  {docA.processing_status === 'failed' && (
                    <>
                      <AlertCircle className="h-4 w-4 text-critical" />
                      <span className="text-xs text-critical">Failed</span>
                    </>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => requirementInputRef.current?.click()}
                >
                  Replace
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full mt-4 gap-2"
                onClick={() => requirementInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Choose File
              </Button>
            )}
            <input
              ref={requirementInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => e.target.files?.[0] && handleFileSelect('requirement', e.target.files[0])}
            />
          </Card>

          {/* Compliance Document */}
          <Card className="p-6 border-2 border-dashed">
            <div className="text-center">
              <FileText className="h-8 w-8 mx-auto mb-2 text-text-muted" />
              <h3 className="font-semibold">Compliance Document</h3>
              <p className="text-sm text-text-secondary mt-1">
                Upload your response, policy, or report document
              </p>
            </div>
            {docB ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">{docB.filename}</p>
                <div className="flex items-center gap-2">
                  {docB.processing_status === 'completed' && (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-xs text-success">Ready</span>
                    </>
                  )}
                  {docB.processing_status === 'processing' && (
                    <>
                      <Clock className="h-4 w-4 text-warning animate-spin" />
                      <span className="text-xs text-warning">Processing...</span>
                    </>
                  )}
                  {docB.processing_status === 'failed' && (
                    <>
                      <AlertCircle className="h-4 w-4 text-critical" />
                      <span className="text-xs text-critical">Failed</span>
                    </>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => complianceInputRef.current?.click()}
                >
                  Replace
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full mt-4 gap-2"
                onClick={() => complianceInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Choose File
              </Button>
            )}
            <input
              ref={complianceInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => e.target.files?.[0] && handleFileSelect('compliance', e.target.files[0])}
            />
          </Card>
        </div>
      </div>

      {/* Analysis Trigger */}
      <Card className="p-6 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Run Compliance Analysis</h3>
          <p className="text-sm text-text-secondary mt-1">
            {!bothReady ? 'Both documents must be uploaded' : 'Ready to analyze'}
          </p>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={!bothReady || analyzeMutation.isPending}
          className="gap-2"
        >
          {analyzeMutation.isPending ? (
            <>
              <Clock className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Analyze
            </>
          )}
        </Button>
      </Card>

      {project?.status === 'failed' && (
        <div className="bg-critical/10 border border-critical/30 rounded-lg p-4 flex items-center gap-2 text-critical">
          <AlertCircle className="h-4 w-4" />
          Analysis failed. Please try again or contact support.
        </div>
      )}
    </div>
  );
}
