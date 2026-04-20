import { PDFViewer } from "./PDFViewer";
import { ExtractedContent } from "./ExtractedContent";

interface Chunk {
  id?: string;
  text?: string;
  metadata?: {
    section_header?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface BaseDoc {
  id: string;
  filename: string;
  file_path?: string;
  [key: string]: any;
}

interface DocumentsTabProps {
  doc: BaseDoc;
  chunks?: Chunk[];
  isLoading?: boolean;
}

export function DocumentsTab({ doc, chunks = [], isLoading }: DocumentsTabProps) {
  return (
    <div className="flex gap-4 h-[calc(100vh-500px)]">
      {/* Left: PDF Viewer (50%) */}
      <div className="w-1/2">
        <PDFViewer filePath={doc.file_path} fileName={doc.filename} />
      </div>

      {/* Right: Extracted Content (50%) */}
      <div className="w-1/2 border rounded-lg p-4 overflow-y-auto">
        <ExtractedContent chunks={chunks} isLoading={isLoading} />
      </div>
    </div>
  );
}
