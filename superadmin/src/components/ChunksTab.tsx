import { useState } from "react";
import { Search } from "lucide-react";
import { ChunkDetailPanel } from "./ChunkDetailPanel";

interface Chunk {
  id?: string;
  text?: string;
  metadata?: {
    section_header?: string;
    section_level?: number;
    chunk_index?: number;
    source?: string;
    page_count?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

export function ChunksTab({ chunks = [], isLoading }: { chunks: Chunk[] | undefined; isLoading: boolean }) {
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(search);
  }

  const filteredChunks = (chunks ?? []).filter(chunk => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (chunk.text || "").toLowerCase().includes(q) ||
           (chunk.metadata?.section_header || "").toLowerCase().includes(q);
  });

  const selectedChunk = chunks?.find(c => c.id === selectedChunkId);

  return (
    <div className="flex gap-4 h-[calc(100vh-300px)] min-h-96">
      {/* List */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <form onSubmit={handleSearch} className="flex gap-2 mb-4 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search chunks..."
              className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-transparent transition-all"
            />
          </div>
          <button
            type="submit"
            className="bg-accent-600 hover:bg-accent-700 text-white text-sm px-3 py-2 rounded-lg transition-colors"
          >
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearch(""); setSearchQuery(""); }}
              className="text-sm text-foreground px-3 py-2 rounded-lg border border-border hover:bg-surface transition-colors"
            >
              Clear
            </button>
          )}
        </form>

        <div className="overflow-y-auto flex-1 space-y-2 pr-2">
          {isLoading && <p className="text-sm text-text-muted text-center py-8">Loading chunks...</p>}

          {!isLoading && filteredChunks.length === 0 && (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-text-muted text-sm">
              {searchQuery ? `No chunks matching "${searchQuery}"` : "No chunks found"}
            </div>
          )}

          {filteredChunks.map((chunk, index) => (
            <div
              key={chunk.id || index}
              onClick={() => chunk.id && setSelectedChunkId(chunk.id)}
              className={`bg-card border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md
                ${selectedChunkId === chunk.id
                  ? "border-accent-600 ring-1 ring-accent-600/30"
                  : "border-border hover:border-accent-600/40 hover:bg-surface"
                }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Chunk {chunk.metadata?.chunk_index ?? index + 1}
                </span>
                {chunk.metadata?.page_count && (
                  <span className="text-xs text-text-muted">Page {chunk.metadata.page_count}</span>
                )}
              </div>
              {chunk.metadata?.section_header && (
                <p className="text-xs font-semibold text-accent-600 mb-1">
                  {chunk.metadata.section_header}
                </p>
              )}
              <p className="text-sm text-text-secondary line-clamp-2">
                {(chunk.text || "").substring(0, 150)}...
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedChunkId && selectedChunk && (
        <ChunkDetailPanel chunk={selectedChunk} onClose={() => setSelectedChunkId(null)} />
      )}
    </div>
  );
}
