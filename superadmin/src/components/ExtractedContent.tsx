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

  // Group chunks by section header, preserving order, concatenating text within a section
  const sections: Array<{ header: string; text: string }> = [];
  const seen = new Map<string, number>(); // header → index in sections

  chunks.forEach(chunk => {
    const header = chunk.metadata?.section_header || chunk.section_header || "";
    const text = (chunk.text || "").trim();
    if (!text) return;

    if (header && seen.has(header)) {
      const idx = seen.get(header)!;
      sections[idx].text += "\n\n" + text;
    } else {
      const idx = sections.length;
      sections.push({ header: header || "Content", text });
      if (header) seen.set(header, idx);
    }
  });

  return (
    <div className="space-y-6">
      {sections.map((section, idx) => (
        <div key={idx} className="border-l-4 border-slate-200 pl-4 py-1">
          {section.header && section.header !== "Content" && (
            <h3 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wide">
              {section.header}
            </h3>
          )}
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {section.text}
          </p>
        </div>
      ))}
    </div>
  );
}
