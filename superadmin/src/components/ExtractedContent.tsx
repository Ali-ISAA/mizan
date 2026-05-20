interface Chunk {
  id?: string;
  text?: string;
  metadata?: { section_header?: string; chunk_index?: number; [key: string]: any };
  section_header?: string;
  chunk_index?: number;
  [key: string]: any;
}

const NOISE_LINE = /^\s*(line chart|logo|<!--.*?-->)\s*$/i;

function cleanText(raw: string): string {
  return raw.split("\n").filter(ln => !NOISE_LINE.test(ln)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function ExtractedContent({ chunks = [], isLoading }: { chunks?: Chunk[]; isLoading?: boolean }) {
  if (isLoading) {
    return <div className="text-center text-text-muted text-sm py-8">Loading content...</div>;
  }
  if (!chunks || chunks.length === 0) {
    return <div className="text-center text-text-muted text-sm py-8">No extracted content available</div>;
  }

  const sorted = [...chunks].sort((a, b) => {
    const ai = a.metadata?.chunk_index ?? a.chunk_index ?? 0;
    const bi = b.metadata?.chunk_index ?? b.chunk_index ?? 0;
    return ai - bi;
  });

  return (
    <div className="space-y-4 text-sm leading-relaxed text-foreground">
      {sorted.map((chunk, idx) => {
        const header = chunk.metadata?.section_header || chunk.section_header || "";
        const text = cleanText(chunk.text || "");
        if (!header && !text) return null;
        return (
          <div key={chunk.id ?? idx}>
            {header && <p className="font-bold text-foreground mt-4 mb-1">{header}</p>}
            {text && <p className="whitespace-pre-wrap text-foreground/90">{text}</p>}
          </div>
        );
      })}
    </div>
  );
}
