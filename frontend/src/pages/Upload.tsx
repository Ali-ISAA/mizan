import { useState, useCallback, useRef } from "react";
import { Upload as UploadIcon, FileText, CheckCircle, ChevronRight, Tag, BookOpen, FileUp } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

const DOC_TYPES = ["GDPR", "SOX", "HIPAA", "ISO 27001", "CCPA", "PCI DSS", "Others"];

interface BaseDoc {
  id: string; filename: string; doc_type: string;
  processing_status: string; chunk_count: number;
}

type Step = 1 | 2 | 3;

export default function Upload() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [selectedType, setSelectedType] = useState("");
  const [selectedBaseDoc, setSelectedBaseDoc] = useState<BaseDoc | null>(null);
  const [userFile, setUserFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const { data: baseDocs = [], isLoading: docsLoading } = useQuery<BaseDoc[]>({
    queryKey: ["base-docs-user", selectedType],
    queryFn: () => {
      const params = selectedType ? `?doc_type=${encodeURIComponent(selectedType)}` : "";
      return api.get(`/base-documents${params}`).then(r => r.data);
    },
    enabled: step === 2,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!userFile || !selectedBaseDoc) throw new Error("Missing file or base document");
      const form = new FormData();
      form.append("file", userFile);
      form.append("base_document_id", selectedBaseDoc.id);
      form.append("doc_type", selectedType);
      return api.post("/documents/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      setUploadSuccess(true);
      setTimeout(() => navigate("/documents"), 2000);
    },
    onError: (e: any) => setUploadError(e.response?.data?.detail || "Upload failed"),
  });

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setUserFile(file);
  }, []);

  function reset() {
    setStep(1); setSelectedType(""); setSelectedBaseDoc(null);
    setUserFile(null); setUploadSuccess(false); setUploadError("");
  }

  if (uploadSuccess) {
    return (
      <div className="flex-1 p-8 animate-fade-in">
        <Card className="max-w-md mx-auto text-center p-8">
          <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Document Uploaded</h3>
          <p className="text-text-secondary text-sm mb-6">Your document is being processed and compared against the selected base document.</p>
          <Button onClick={reset}>Upload Another</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-8 animate-fade-in">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Upload Document</h1>
        <p className="text-text-secondary mt-2">Upload your document for compliance comparison.</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-3 overflow-x-auto pb-4 mb-6">
        {([1, 2, 3] as Step[]).map((s, i) => {
          const getIcon = () => {
            switch (s) {
              case 1: return <Tag className="h-4 w-4" />;
              case 2: return <BookOpen className="h-4 w-4" />;
              case 3: return <FileUp className="h-4 w-4" />;
              default: return s;
            }
          };
          return (
            <div key={s} className="flex items-center gap-2 flex-shrink-0">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                step > s ? "bg-success text-white" : step === s ? "bg-accent-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {step > s ? <CheckCircle className="h-4 w-4" /> : getIcon()}
              </div>
              <span className={`text-sm whitespace-nowrap ${step === s ? "font-medium text-foreground" : "text-text-secondary"}`}>
                {s === 1 ? "Select Type" : s === 2 ? "Choose Base Document" : "Upload Your Document"}
              </span>
              {i < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">

          {/* Step 1: Select Type */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Document Type</CardTitle>
                <CardDescription>What type of compliance standard does your document relate to?</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {DOC_TYPES.map(type => (
                    <button
                      key={type}
                      onClick={() => { setSelectedType(type); setStep(2); }}
                      className={`p-4 rounded-lg border-2 text-left transition-all hover:border-accent-600 hover:bg-accent-600/5 ${
                        selectedType === type ? "border-accent-600 bg-accent-600/5" : "border-border"
                      }`}
                    >
                      <p className="font-semibold text-sm">{type}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Choose Base Document */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Choose Base Document</CardTitle>
                    <CardDescription>
                      Select the <Badge variant="outline">{selectedType}</Badge> reference document to compare against.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setStep(1)}>Change Type</Button>
                </div>
              </CardHeader>
              <CardContent>
                {docsLoading && <p className="text-sm text-text-secondary">Loading documents...</p>}
                {!docsLoading && baseDocs.length === 0 && (
                  <div className="text-center py-8">
                    <FileText className="h-10 w-10 mx-auto text-text-muted mb-3" />
                    <p className="text-sm font-medium">No base documents available</p>
                    <p className="text-xs text-text-secondary mt-1">No {selectedType} documents have been uploaded by the admin yet.</p>
                  </div>
                )}
                <div className="space-y-2">
                  {baseDocs.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => { setSelectedBaseDoc(doc); setStep(3); }}
                      className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-all hover:border-accent-600 hover:bg-accent-600/5 ${
                        selectedBaseDoc?.id === doc.id ? "border-accent-600 bg-accent-600/5" : "border-border"
                      }`}
                    >
                      <FileText className="h-5 w-5 text-text-muted flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{doc.filename}</p>
                        <p className="text-xs text-text-secondary mt-0.5">{doc.chunk_count} chunks</p>
                      </div>
                      <Badge variant="outline">{doc.doc_type}</Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Upload user file */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Upload Your Document</CardTitle>
                    <CardDescription>
                      Comparing against: <span className="font-medium">{selectedBaseDoc?.filename}</span>
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setStep(2)}>Change Base Doc</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                    isDragging ? "border-accent-600 bg-accent-600/5" : "border-border hover:border-accent-600/50"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  {userFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle className="h-8 w-8 text-success" />
                      <p className="font-medium text-sm">{userFile.name}</p>
                      <p className="text-xs text-text-secondary">{(userFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <UploadIcon className="h-8 w-8 text-text-muted" />
                      <p className="font-medium text-sm">Drag & drop or click to browse</p>
                      <p className="text-xs text-text-secondary">PDF, DOC, DOCX, TXT</p>
                    </div>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={e => setUserFile(e.target.files?.[0] || null)}
                  />
                </div>

                {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

                <Button
                  className="w-full"
                  onClick={() => uploadMutation.mutate()}
                  disabled={!userFile || uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar: Quick Tips */}
        <div>
          <Card className="sticky top-8">
            <CardHeader>
              <CardTitle>Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <h4 className="font-semibold text-foreground mb-1.5">📄 Supported Formats</h4>
                <p className="text-sm text-text-secondary">PDF, DOC, DOCX, TXT files up to 50MB each</p>
              </div>

              <div className="h-px bg-border"></div>

              <div>
                <h4 className="font-semibold text-foreground mb-1.5">⏱️ Processing Time</h4>
                <p className="text-sm text-text-secondary">Most documents are analyzed within 2-5 minutes</p>
              </div>

              <div className="h-px bg-border"></div>

              <div>
                <h4 className="font-semibold text-foreground mb-1.5">📦 Batch Upload</h4>
                <p className="text-sm text-text-secondary">Upload up to 10 documents at once for efficiency</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
