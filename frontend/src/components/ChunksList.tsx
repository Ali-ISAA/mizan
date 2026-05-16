import { useState } from "react";
import { Search, X } from "lucide-react";

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

interface ChunksListProps {
  chunks: Chunk[];
  isLoading: boolean;
}

interface ChunkDetailPanelProps {
  chunk: Chunk;
  onClose: () => void;
}

function ChunkDetailPanel({ chunk, onClose }: ChunkDetailPanelProps) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col min-w-0 border-l border-border">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface">
        <h3 className="font-semibold text-foreground text-sm">
          {chunk.metadata?.section_header || "Chunk Detail"}
        </h3>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
        <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
          {chunk.text}
        </p>
        {chunk.metadata && (
          <div className="pt-4 border-t border-border">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              Metadata
            </h4>
            <dl className="space-y-1.5 text-xs">
              {chunk.metadata.section_level !== undefined && (
                <div className="flex gap-2">
                  <dt className="font-medium text-text-secondary">Section Level:</dt>
                  <dd className="text-text-muted">{chunk.metadata.section_level}</dd>
                </div>
              )}
              {chunk.metadata.chunk_index !== undefined && (
                <div className="flex gap-2">
                  <dt className="font-medium text-text-secondary">Chunk Index:</dt>
                  <dd className="text-text-muted">{chunk.metadata.chunk_index}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChunksList({ chunks = [], isLoading }: ChunksListProps) {
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(search);
  }

  const filteredChunks = chunks?.filter((chunk) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    const text = (chunk.text || "").toLowerCase();
    const sectionHeader = (chunk.metadata?.section_header || "").toLowerCase();
    return text.includes(searchLower) || sectionHeader.includes(searchLower);
  });

  const selectedChunk = chunks?.find((c) => c.id === selectedChunkId);

  return (
    <div className="flex gap-0 h-full overflow-hidden">
      {/* Left: Chunks list */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2 pb-4 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chunks..."
              className="w-full bg-surface border border-border rounded-md pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-600/40 focus:border-accent-600/50 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="bg-accent-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-accent-600/90 transition-colors"
          >
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearch(""); setSearchQuery(""); }}
              className="text-sm text-text-secondary px-3 py-1.5 rounded-md border border-border hover:bg-surface transition-colors"
            >
              Clear
            </button>
          )}
        </form>

        {/* Chunks list */}
        <div className="overflow-y-auto scrollbar-thin flex-1 space-y-2 pr-1">
          {isLoading && (
            <p className="text-sm text-text-muted px-1">Loading chunks...</p>
          )}

          {!isLoading && filteredChunks.length === 0 && (
            <div className="card-elevated p-8 text-center text-text-muted text-sm">
              {searchQuery ? `No chunks matching "${searchQuery}"` : "No chunks found"}
            </div>
          )}

          {filteredChunks.map((chunk, index) => (
            <div
              key={chunk.id || index}
              onClick={() => chunk.id && setSelectedChunkId(chunk.id)}
              className={`bg-surface border border-border rounded-lg p-3.5 cursor-pointer transition-all hover:border-accent-600/30 hover:bg-surface-elevated ${
                selectedChunkId === chunk.id ? "border-accent-600/50 bg-accent-600/5" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                  Chunk {chunk.metadata?.chunk_index ?? index}
                </span>
              </div>
              {chunk.metadata?.section_header && (
                <p className="text-sm font-semibold text-foreground mb-1">
                  {chunk.metadata.section_header}
                </p>
              )}
              <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed">
                {(chunk.text || "").substring(0, 150)}...
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Detail panel (conditional) */}
      {selectedChunkId && selectedChunk && (
        <ChunkDetailPanel
          chunk={selectedChunk}
          onClose={() => setSelectedChunkId(null)}
        />
      )}
    </div>
  );
}
