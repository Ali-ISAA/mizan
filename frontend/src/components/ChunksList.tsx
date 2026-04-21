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
    <div className="flex-1 overflow-hidden flex flex-col min-w-0">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-gray-900">
          {chunk.metadata?.section_header || "Chunk Detail"}
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm text-gray-700 whitespace-pre-wrap">
          {chunk.text}
        </p>
        {chunk.metadata && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Metadata
            </h4>
            <dl className="space-y-2 text-xs">
              {chunk.metadata.section_level !== undefined && (
                <div>
                  <dt className="font-medium text-gray-600">Section Level:</dt>
                  <dd className="text-gray-500">
                    {chunk.metadata.section_level}
                  </dd>
                </div>
              )}
              {chunk.metadata.chunk_index !== undefined && (
                <div>
                  <dt className="font-medium text-gray-600">Chunk Index:</dt>
                  <dd className="text-gray-500">
                    {chunk.metadata.chunk_index}
                  </dd>
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
    const sectionHeader = (
      chunk.metadata?.section_header || ""
    ).toLowerCase();
    return text.includes(searchLower) || sectionHeader.includes(searchLower);
  });

  const selectedChunk = chunks?.find((c) => c.id === selectedChunkId);

  return (
    <div className="flex gap-4 h-full overflow-hidden">
      {/* Left: Chunks list */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2 p-4 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chunks..."
              className="w-full border rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <button
            type="submit"
            className="bg-slate-900 text-white text-sm px-3 py-1.5 rounded-md hover:bg-slate-800"
          >
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSearchQuery("");
              }}
              className="text-sm text-gray-500 px-3 py-1.5 rounded-md border hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </form>

        {/* Chunks list */}
        <div className="overflow-y-auto flex-1 space-y-2 p-4">
          {isLoading && (
            <p className="text-sm text-gray-400">Loading chunks...</p>
          )}

          {!isLoading && filteredChunks.length === 0 && (
            <div className="bg-white border rounded-lg p-8 text-center text-gray-400 text-sm">
              {searchQuery
                ? `No chunks matching "${searchQuery}"`
                : "No chunks found"}
            </div>
          )}

          {filteredChunks.map((chunk, index) => (
            <div
              key={chunk.id || index}
              onClick={() => chunk.id && setSelectedChunkId(chunk.id)}
              className="bg-white border rounded-lg p-3 cursor-pointer hover:shadow-md hover:bg-gray-50 transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-500 uppercase">
                  Chunk {chunk.metadata?.chunk_index ?? index + 1}
                </span>
              </div>
              {chunk.metadata?.section_header && (
                <p className="text-xs font-semibold text-gray-700 mb-1">
                  {chunk.metadata.section_header}
                </p>
              )}
              <p className="text-sm text-gray-600 line-clamp-2">
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
