import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface ProgressIndicatorProps {
  currentChunk: number;
  totalChunks: number;
  startedAt: string;
  estimatedCompletion: string;
}

export function ProgressIndicator({
  currentChunk,
  totalChunks,
  startedAt,
  estimatedCompletion,
}: ProgressIndicatorProps) {
  const percentage = Math.round((currentChunk / totalChunks) * 100);
  const elapsedMs = Date.now() - new Date(startedAt).getTime();
  const remainingMs = new Date(estimatedCompletion).getTime() - Date.now();

  const formatTime = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    return `${minutes}m`;
  };

  return (
    <Card className="border-0 bg-slate-900/50">
      <CardContent className="pt-8 space-y-6">
        {/* Progress Bar */}
        <div>
          <div className="flex justify-between mb-2">
            <p className="text-slate-400 font-medium">Analysis in progress...</p>
            <p className="text-slate-400 font-medium">{percentage}%</p>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Chunk Info */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
          <p className="text-slate-300">Chunk {currentChunk} of {totalChunks}</p>
          <p className="text-xs text-slate-500">
            Elapsed: {formatTime(elapsedMs)} • Est. remaining: {formatTime(Math.max(0, remainingMs))}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
