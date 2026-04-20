import { useState } from "react";
import { Document, Page } from "react-pdf";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface PDFViewerProps {
  filePath?: string;
  fileName?: string;
}

export function PDFViewer({ filePath, fileName }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setError(null);
  }

  function onDocumentLoadError(error: Error) {
    setError("Failed to load PDF");
    console.error("PDF load error:", error);
  }

  // Construct PDF URL - assumes files are served from /uploads endpoint
  const pdfUrl = filePath
    ? `/uploads${filePath.startsWith("/") ? filePath : "/" + filePath}`
    : undefined;

  if (!pdfUrl) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p className="text-sm">No document available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded border">
      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center">
        {error ? (
          <div className="text-center text-red-600 text-sm">
            <p>{error}</p>
            <p className="text-xs text-gray-500 mt-2">{pdfUrl}</p>
          </div>
        ) : (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={<div className="text-gray-400 text-sm">Loading PDF...</div>}
          >
            <Page
              pageNumber={currentPage}
              width={600}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        )}
      </div>

      {/* Navigation Controls */}
      {numPages && !error && (
        <div className="border-t bg-white p-3 flex items-center justify-between">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>

          <span className="text-sm text-gray-600">
            Page <span className="font-medium">{currentPage}</span> of{" "}
            <span className="font-medium">{numPages}</span>
          </span>

          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, numPages))}
            disabled={currentPage === numPages}
            className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
