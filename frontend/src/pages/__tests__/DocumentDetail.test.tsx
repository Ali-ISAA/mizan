import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the components first
jest.mock('@/components/ChunksList', () => ({
  ChunksList: () => <div>Chunks List</div>,
}));

jest.mock('@/components/ExtractedContentView', () => ({
  ExtractedContentView: () => <div>Extracted Content</div>,
}));

jest.mock('@/components/ComparisonResults', () => ({
  ComparisonResults: () => <div>Comparison Results</div>,
}));

// Mock the API
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

import DocumentDetail from '../DocumentDetail';
import { api } from '@/lib/api';

const mockApi = api as jest.Mocked<typeof api>;

const mockDocument = {
  id: 'test-id',
  name: 'Test Document',
  file_type: 'PDF',
  file_size: 1024,
  processing_status: 'completed',
  noesia_chunk_count: 10,
  created_at: '2024-01-01T00:00:00Z',
};

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('DocumentDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock API response with completed document
    mockApi.get.mockResolvedValue({
      data: [mockDocument],
    });
  });

  it('should initialize activeTab to "comparison" when ?tab=comparison is in URL', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/test-id?tab=comparison']}>
          <Routes>
            <Route path="/documents/:documentId" element={<DocumentDetail />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    // The Compliance Analysis tab should be active
    await waitFor(() => {
      const complianceTab = screen.getByRole('button', { name: /Compliance Analysis/i });
      expect(complianceTab).toHaveClass('text-accent-600');
    });
  });

  it('should default to "chunks" tab when no tab parameter is provided', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/test-id']}>
          <Routes>
            <Route path="/documents/:documentId" element={<DocumentDetail />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    // The Chunks tab should be active by default
    await waitFor(() => {
      const chunksTab = screen.getByRole('button', { name: /Chunks/i });
      expect(chunksTab).toHaveClass('text-accent-600');
    });
  });

  it('should support other tab values from URL parameter', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/test-id?tab=document']}>
          <Routes>
            <Route path="/documents/:documentId" element={<DocumentDetail />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    // The Document tab should be active
    await waitFor(() => {
      const tabs = screen.getAllByRole('button', { name: /Document/i });
      // The tab button is the one that contains "Document" text directly in the tabs section
      const documentTab = tabs.find(tab => tab.textContent?.trim() === 'Document' && tab.className.includes('border-b'));
      expect(documentTab).toHaveClass('text-accent-600');
    });
  });
});
