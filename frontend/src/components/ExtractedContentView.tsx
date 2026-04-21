interface Chunk {
  id?: string;
  text?: string;
  metadata?: {
    section_header?: string;
    section_level?: number;
    chunk_index?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

interface ExtractedContentViewProps {
  chunks?: Chunk[];
  isLoading?: boolean;
}

export function ExtractedContentView({
  chunks = [],
  isLoading,
}: ExtractedContentViewProps) {
  if (isLoading) {
    return (
      <div className="text-center text-gray-400 text-sm py-8">
        <p>Loading content...</p>
      </div>
    );
  }

  if (!chunks || chunks.length === 0) {
    return (
      <div className="text-center text-gray-400 text-sm py-8">
        <p>No extracted content available</p>
      </div>
    );
  }

  // Group chunks by section header
  const sections: Array<{ header: string; chunks: Chunk[] }> = [];
  let currentSection: string | null = null;
  let currentChunks: Chunk[] = [];

  chunks.forEach((chunk) => {
    const header = chunk.metadata?.section_header || "Content";

    if (header !== currentSection) {
      if (currentSection !== null) {
        sections.push({
          header: currentSection,
          chunks: [...currentChunks],
        });
      }
      currentSection = header;
      currentChunks = [chunk];
    } else {
      currentChunks.push(chunk);
    }
  });

  // Add last section
  if (currentSection !== null) {
    sections.push({
      header: currentSection,
      chunks: currentChunks,
    });
  }

  return (
    <div className="space-y-8 overflow-y-auto p-6 h-full">
      {sections.map((section, idx) => (
        <div key={idx} className="border-l-4 border-slate-300 pl-4 py-2">
          <h3 className="text-base font-bold text-slate-900 mb-4 uppercase tracking-wide">
            {section.header}
          </h3>
          <div className="space-y-4">
            {section.chunks.map((chunk, chunkIdx) => (
              <div
                key={chunk.id || chunkIdx}
                className="bg-gray-50 rounded p-4 hover:bg-gray-100 transition-colors"
              >
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {chunk.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
