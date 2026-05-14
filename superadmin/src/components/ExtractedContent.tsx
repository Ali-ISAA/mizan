interface Chunk {
  id?: string;
  text?: string;
  metadata?: {
    section_header?: string;
    chunk_index?: number;
    [key: string]: any;
  };
  section_header?: string;
  chunk_index?: number;
  [key: string]: any;
}

interface ExtractedContentProps {
  chunks?: Chunk[];
  isLoading?: boolean;
}

const NOISE_LINE = /^\s*(line chart|logo|<!--.*?-->)\s*$/i;

function cleanText(raw: string): string {
  const lines = raw.split("\n").filter(ln => !NOISE_LINE.test(ln));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function ExtractedContent({ chunks = [], isLoading }: ExtractedContentProps) {
  if (isLoading) {
    return <div className="text-center text-gray-400 text-sm py-8">Loading content...</div>;
  }

  if (!chunks || chunks.length === 0) {
    return <div className="text-center text-gray-400 text-sm py-8">No extracted content available</div>;
  }

  // Sort by chunk_index to ensure document order
  const sorted = [...chunks].sort((a, b) => {
    const ai = a.metadata?.chunk_index ?? a.chunk_index ?? 0;
    const bi = b.metadata?.chunk_index ?? b.chunk_index ?? 0;
    return ai - bi;
  });

  return (
    <div className="space-y-4 font-sans text-sm leading-relaxed text-gray-800">
      {sorted.map((chunk, idx) => {
        const header = chunk.metadata?.section_header || chunk.section_header || "";
        const text = cleanText(chunk.text || "");
        if (!header && !text) return null;
        return (
          <div key={chunk.id ?? idx}>
            {header && (
              <p className="font-bold text-slate-900 mt-4 mb-1">{header}</p>
            )}
            {text && (
              <p className="whitespace-pre-wrap">{text}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
