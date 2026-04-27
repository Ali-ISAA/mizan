import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the API
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

import ComplianceAnalysisView from '../ComplianceAnalysisView';
import { api } from '@/lib/api';

const mockApi = api as jest.Mocked<typeof api>;

const mockDocument = {
  id: 'doc-123',
  name: 'Test Compliance Document',
  file_type: 'PDF',
  file_size: 1024,
  processing_status: 'completed',
  created_at: '2024-01-01T00:00:00Z',
};

const mockReport = {
  id: 'report-123',
  compliance_score: 94,
  total_findings: 3,
  critical_count: 0,
  medium_count: 1,
  low_count: 2,
  summary: 'Overall compliance is strong with minor gaps.',
};

const mockFindings = [
  {
    id: 'finding-1',
    doc_a_section: 'Section 1.1',
    doc_b_section: 'Requirement 1.1',
    status: 'compliant',
    severity: 'low',
    issue: 'Minor formatting issue',
    recommendation: 'Update formatting',
  },
  {
    id: 'finding-2',
    doc_a_section: 'Section 2.1',
    doc_b_section: 'Requirement 2.1',
    status: 'gap',
    severity: 'medium',
    issue: 'Missing documentation',
    recommendation: 'Add missing documentation',
  },
  {
    id: 'finding-3',
    doc_a_section: 'Section 3.1',
    doc_b_section: 'Requirement 3.1',
    status: 'compliant',
    severity: 'low',
    issue: 'Minor deviation',
    recommendation: 'Review and align',
  },
];

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

describe('ComplianceAnalysisView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/documents' || url.includes('/documents/') && !url.includes('/comparisons')) {
        return Promise.resolve({
          data: url === '/documents' ? [mockDocument] : mockDocument,
        });
      }
      if (url.includes('/comparisons/') && url.includes('/report')) {
        return Promise.resolve({
          data: {
            report: mockReport,
            findings: mockFindings,
          },
        });
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  it('should render "No Analysis Yet" when no comparison_id in URL', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/doc-123/analysis']}>
          <Routes>
            <Route path="/documents/:documentId/analysis" element={<ComplianceAnalysisView />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/No Analysis Yet/i)).toBeInTheDocument();
    });
  });

  it('should fetch and display document info when mounted', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/doc-123/analysis?comparison_id=comp-123']}>
          <Routes>
            <Route path="/documents/:documentId/analysis" element={<ComplianceAnalysisView />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/documents');
    });
  });

  it('should fetch and display comparison report when comparison_id is provided', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/doc-123/analysis?comparison_id=comp-123']}>
          <Routes>
            <Route path="/documents/:documentId/analysis" element={<ComplianceAnalysisView />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/Test Compliance Document/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('/comparisons/comp-123/report'));
    });
  });

  it('should display compliance score prominently', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/doc-123/analysis?comparison_id=comp-123']}>
          <Routes>
            <Route path="/documents/:documentId/analysis" element={<ComplianceAnalysisView />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/94%/)).toBeInTheDocument();
    });
  });

  it('should display findings count by severity', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/doc-123/analysis?comparison_id=comp-123']}>
          <Routes>
            <Route path="/documents/:documentId/analysis" element={<ComplianceAnalysisView />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      // Should show counts for critical, medium, low
      expect(screen.getByText('0')).toBeInTheDocument(); // critical_count
      expect(screen.getByText('1')).toBeInTheDocument(); // medium_count
      expect(screen.getByText('2')).toBeInTheDocument(); // low_count
    });
  });

  it('should display findings list with issue details', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/doc-123/analysis?comparison_id=comp-123']}>
          <Routes>
            <Route path="/documents/:documentId/analysis" element={<ComplianceAnalysisView />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      // Should display findings - check for the issue title in an h4
      const findings = screen.queryAllByText(/Missing documentation/i);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  it('should have back button that navigates to documents', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/doc-123/analysis?comparison_id=comp-123']}>
          <Routes>
            <Route path="/documents/:documentId/analysis" element={<ComplianceAnalysisView />} />
            <Route path="/documents" element={<div>Documents Page</div>} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      const backButton = screen.getByRole('button', { name: /Back to Documents/i });
      expect(backButton).toBeInTheDocument();
    });
  });

  it('should show loading state initially', async () => {
    mockApi.get.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/doc-123/analysis?comparison_id=comp-123']}>
          <Routes>
            <Route path="/documents/:documentId/analysis" element={<ComplianceAnalysisView />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    // Should show loading state
    expect(screen.queryByText(/Loading/i)).toBeInTheDocument();
  });

  it('should have Download Report button', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/doc-123/analysis?comparison_id=comp-123']}>
          <Routes>
            <Route path="/documents/:documentId/analysis" element={<ComplianceAnalysisView />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download Report/i })).toBeInTheDocument();
    });
  });

  it('should have Ask AI Assistant button', async () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/documents/doc-123/analysis?comparison_id=comp-123']}>
          <Routes>
            <Route path="/documents/:documentId/analysis" element={<ComplianceAnalysisView />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ask AI Assistant/i })).toBeInTheDocument();
    });
  });
});
