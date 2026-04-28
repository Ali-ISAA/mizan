import { render, screen } from '@testing-library/react';
import { ProgressIndicator } from '@/components/ProgressIndicator';

describe('ProgressIndicator', () => {
  it('should display progress bar with correct percentage', () => {
    const props = {
      currentChunk: 5,
      totalChunks: 20,
      startedAt: new Date(Date.now() - 60000).toISOString(), // 1 min ago
      estimatedCompletion: new Date(Date.now() + 420000).toISOString(), // 7 min from now
    };

    render(<ProgressIndicator {...props} />);

    // Should show 25% (5/20)
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('Chunk 5 of 20')).toBeInTheDocument();
  });

  it('should display elapsed and remaining time', () => {
    const props = {
      currentChunk: 10,
      totalChunks: 20,
      startedAt: new Date(Date.now() - 120000).toISOString(), // 2 min ago
      estimatedCompletion: new Date(Date.now() + 360000).toISOString(), // 6 min from now
    };

    render(<ProgressIndicator {...props} />);

    expect(screen.getByText(/Elapsed.*remaining/i)).toBeInTheDocument();
  });
});
