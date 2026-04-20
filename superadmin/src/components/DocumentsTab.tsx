import { ExtractedContent } from "./ExtractedContent";
import { Download } from "lucide-react";

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
  file_size?: number | null;
  [key: string]: any;
}

interface DocumentsTabProps {
  doc: BaseDoc;
  chunks?: Chunk[];
  isLoading?: boolean;
}

export function DocumentsTab({ doc, chunks = [], isLoading }: DocumentsTabProps) {
  function formatSize(bytes: number | null | undefined) {
    if (!bytes) return "—";
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-300px)] min-h-96 gap-4">
      {/* Document Info */}
      <div className="bg-white border rounded-lg p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{doc.filename}</h3>
            <p className="text-sm text-gray-500 mt-1">File size: {formatSize(doc.file_size)}</p>
          </div>
          <a
            href={doc.file_path ? `/uploads${doc.file_path.startsWith("/") ? doc.file_path : "/" + doc.file_path}` : "#"}
            download
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      </div>

      {/* Extracted Content - Fills Remaining Space */}
      <div className="bg-white border rounded-lg p-6 overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-y-auto flex-1">
          <ExtractedContent chunks={chunks} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
