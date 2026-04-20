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

interface ExtractedContentProps {
  chunks?: Chunk[];
  isLoading?: boolean;
}

export function ExtractedContent({ chunks = [], isLoading }: ExtractedContentProps) {
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

  chunks.forEach(chunk => {
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
    <div className="space-y-6">
      {sections.map((section, idx) => (
        <div key={idx}>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            {section.header}
          </h3>
          <div className="space-y-2">
            {section.chunks.map((chunk, chunkIdx) => (
              <p
                key={chunk.id}
                className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
              >
                {chunk.text}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
