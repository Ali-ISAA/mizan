import { useState, useCallback } from "react";
import { Upload as UploadIcon, FileText, FileImage, File, X, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  type: string;
  status: "uploading" | "processing" | "completed" | "error";
  progress: number;
}

const Upload = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [category, setCategory] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      handleFiles(selectedFiles);
    }
  }, []);

  const handleFiles = (newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map((file, index) => ({
      id: `file-${Date.now()}-${index}`,
      name: file.name,
      size: formatFileSize(file.size),
      type: file.type,
      status: "uploading" as const,
      progress: 0
    }));

    setFiles(prev => [...prev, ...uploadedFiles]);

    // Simulate upload progress
    uploadedFiles.forEach((file) => {
      simulateUpload(file.id);
    });
  };

  const simulateUpload = (fileId: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      
      setFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { 
              ...f, 
              progress: Math.min(progress, 100),
              status: progress >= 100 ? "processing" : "uploading"
            }
          : f
      ));

      if (progress >= 100) {
        clearInterval(interval);
        // Simulate processing
        setTimeout(() => {
          setFiles(prev => prev.map(f => 
            f.id === fileId 
              ? { ...f, status: "completed" }
              : f
          ));
        }, 2000);
      }
    }, 200);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return <FileText className="h-5 w-5 text-destructive" />;
    if (type.includes('image')) return <FileImage className="h-5 w-5 text-success" />;
    return <File className="h-5 w-5 text-muted" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "uploading":
        return <Badge variant="secondary">Uploading</Badge>;
      case "processing":
        return <Badge className="badge-warning">Processing</Badge>;
      case "completed":
        return <Badge className="badge-compliant">Completed</Badge>;
      case "error":
        return <Badge className="badge-critical">Error</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="border-b pb-6">
        <h1 className="text-3xl font-bold">Upload Documents</h1>
        <p className="text-muted-foreground">
          Upload legal documents for compliance analysis and review.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upload Area */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Document Upload</CardTitle>
              <CardDescription>
                Drag and drop files or click to browse. Supports PDF, DOCX, and TXT files.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`relative border-2 border-dashed rounded-lg p-8 transition-colors ${
                  isDragging 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="text-center">
                  <UploadIcon className="mx-auto h-12 w-12 text-muted mb-4" />
                  <h3 className="text-lg font-medium mb-2">Drop files here</h3>
                  <p className="text-muted-foreground mb-4">
                    or click to browse your computer
                  </p>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Button variant="outline">Choose Files</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* File List */}
          {files.length > 0 && (
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Uploaded Files ({files.length})</CardTitle>
                <CardDescription>
                  Track the upload and processing status of your documents.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {files.map((file) => (
                    <div key={file.id} className="flex items-center gap-4 p-4 rounded-lg bg-surface">
                      <div className="flex-shrink-0">
                        {getFileIcon(file.type)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(file.id)}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{file.size}</p>
                        
                        {file.status === "uploading" && (
                          <Progress value={file.progress} className="h-2" />
                        )}
                        
                        <div className="flex items-center justify-between mt-2">
                          {getStatusBadge(file.status)}
                          {file.status === "completed" && (
                            <CheckCircle className="h-4 w-4 text-success" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Settings Sidebar */}
        <div className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Document Settings</CardTitle>
              <CardDescription>
                Configure how your documents should be processed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category">Document Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="policy">Policy</SelectItem>
                    <SelectItem value="agreement">Agreement</SelectItem>
                    <SelectItem value="legal-doc">Legal Document</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="jurisdiction">Jurisdiction</Label>
                <Select value={jurisdiction} onValueChange={setJurisdiction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select jurisdiction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="us">United States</SelectItem>
                    <SelectItem value="eu">European Union</SelectItem>
                    <SelectItem value="uk">United Kingdom</SelectItem>
                    <SelectItem value="canada">Canada</SelectItem>
                    <SelectItem value="australia">Australia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                className="w-full gradient-primary" 
                disabled={files.length === 0}
              >
                Analyze Documents
              </Button>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm">
                <h4 className="font-medium mb-1">Supported Formats</h4>
                <p className="text-muted-foreground">PDF, DOCX, TXT files up to 50MB each</p>
              </div>
              
              <div className="text-sm">
                <h4 className="font-medium mb-1">Processing Time</h4>
                <p className="text-muted-foreground">Most documents are analyzed within 2-5 minutes</p>
              </div>
              
              <div className="text-sm">
                <h4 className="font-medium mb-1">Batch Upload</h4>
                <p className="text-muted-foreground">Upload up to 10 documents at once for efficiency</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Upload;