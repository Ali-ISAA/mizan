import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ComparisonResults } from '@/components/ComparisonResults';
import { ProgressIndicator } from '@/components/ProgressIndicator';
import { ComplianceAnalysisResults } from '@/pages/ComplianceAnalysisResults';

// Mock the useComparison hook
jest.mock('@/hooks/useComparison', () => ({
  useComparison: jest.fn(),
}));

import { useComparison } from '@/hooks/useComparison';

const mockUseComparison = useComparison as jest.MockedFunction<typeof useComparison>;

const mockReport = {
  id: 'report-123',
  compliance_score: 94,
  critical_count: 0,
  medium_count: 1,
  low_count: 2,
  summary: 'Overall compliance is strong with minor gaps.',
  total_findings: 3,
};

const mockFindings = [
  {
    id: 'finding-1',
    doc_a_section: 'Section 1.1',
    doc_b_section: 'Requirement 1.1',
    status: 'compliant' as const,
    severity: 'low' as const,
    issue: 'Minor formatting issue',
    recommendation: 'Update formatting',
  },
  {
    id: 'finding-2',
    doc_a_section: 'Section 2.1',
    doc_b_section: 'Requirement 2.1',
    status: 'gap' as const,
    severity: 'medium' as const,
    issue: 'Missing documentation',
    recommendation: 'Add missing documentation',
  },
  {
    id: 'finding-3',
    doc_a_section: 'Section 3.1',
    doc_b_section: 'Requirement 3.1',
    status: 'compliant' as const,
    severity: 'low' as const,
    issue: 'Minor deviation',
    recommendation: 'Review and align',
  },
];

const mockProcessingState = {
  comparisonId: 'test-id',
  status: 'processing' as const,
  report: null,
  findings: [],
  isLoading: false,
  error: null,
  startedAt: new Date(Date.now() - 60000).toISOString(), // 1 min ago
  completedAt: undefined,
  currentChunk: 5,
  totalChunks: 20,
  estimatedCompletion: new Date(Date.now() + 420000).toISOString(), // 7 min from now
};

const mockCompletedState = {
  comparisonId: 'test-id',
  status: 'completed' as const,
  report: mockReport,
  findings: mockFindings,
  isLoading: false,
  error: null,
  startedAt: new Date(Date.now() - 600000).toISOString(), // 10 min ago
  completedAt: new Date(Date.now() - 100000).toISOString(),
  currentChunk: 20,
  totalChunks: 20,
  estimatedCompletion: new Date(Date.now() - 100000).toISOString(), // completed 100s ago
};

const mockFailedState = {
  comparisonId: 'test-id',
  status: 'failed' as const,
  report: null,
  findings: [],
  isLoading: false,
  error: 'Analysis failed due to server error',
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  currentChunk: 0,
  totalChunks: 0,
  estimatedCompletion: undefined,
};

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Compliance Analysis Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display ProgressIndicator when status is processing', () => {
    mockUseComparison.mockReturnValue(mockProcessingState);

    render(
      <Wrapper>
        <ComparisonResults comparisonId="test-id" />
      </Wrapper>
    );

    // Should show progress bar percentage
    expect(screen.getByText('25%')).toBeInTheDocument(); // 5/20 = 25%
    // Should show chunk counter
    expect(screen.getByText('Chunk 5 of 20')).toBeInTheDocument();
    // Should show elapsed and remaining time
    expect(screen.getByText(/Elapsed.*remaining/i)).toBeInTheDocument();
  });

  it('should display ProgressIndicator with loading spinner', () => {
    mockUseComparison.mockReturnValue(mockProcessingState);

    const { container } = render(
      <Wrapper>
        <ComparisonResults comparisonId="test-id" />
      </Wrapper>
    );

    // Should display a spinner during processing
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should display ComparisonResults with report when status is completed', async () => {
    mockUseComparison.mockReturnValue(mockCompletedState);

    render(
      <Wrapper>
        <ComparisonResults comparisonId="test-id" />
      </Wrapper>
    );

    await waitFor(() => {
      // Should display compliance score
      expect(screen.getByText(/94%/)).toBeInTheDocument();
      // Should display summary
      expect(screen.getByText(/Overall compliance is strong with minor gaps/)).toBeInTheDocument();
    });
  });

  it('should display findings when comparison completes', async () => {
    mockUseComparison.mockReturnValue(mockCompletedState);

    render(
      <Wrapper>
        <ComparisonResults comparisonId="test-id" />
      </Wrapper>
    );

    await waitFor(() => {
      // Should display findings - check for issue titles
      expect(screen.getByText(/Missing documentation/)).toBeInTheDocument();
      expect(screen.getByText(/Minor deviation/)).toBeInTheDocument();
    });
  });

  it('should display error message when status is failed', () => {
    mockUseComparison.mockReturnValue(mockFailedState);

    render(
      <Wrapper>
        <ComparisonResults comparisonId="test-id" />
      </Wrapper>
    );

    // Should display error message
    expect(screen.getByText(/Analysis Failed/)).toBeInTheDocument();
    expect(screen.getByText(/Analysis failed due to server error/)).toBeInTheDocument();
  });

  it('should show no comparison message when comparisonId is null', () => {
    mockUseComparison.mockReturnValue({
      comparisonId: null,
      status: 'pending' as const,
      report: null,
      findings: [],
      isLoading: false,
      error: null,
      startedAt: undefined,
      completedAt: undefined,
      currentChunk: undefined,
      totalChunks: undefined,
      estimatedCompletion: undefined,
    });

    render(
      <Wrapper>
        <ComparisonResults comparisonId={null} />
      </Wrapper>
    );

    // Should show message about no comparison
    expect(screen.getByText(/No comparison started/)).toBeInTheDocument();
  });

  it('should simulate transition from processing to completed state', async () => {
    // Start with processing state
    mockUseComparison.mockReturnValue(mockProcessingState);

    const { rerender } = render(
      <Wrapper>
        <ComparisonResults comparisonId="test-id" />
      </Wrapper>
    );

    // Verify processing state is shown
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('Chunk 5 of 20')).toBeInTheDocument();

    // Update to completed state
    mockUseComparison.mockReturnValue(mockCompletedState);

    rerender(
      <Wrapper>
        <ComparisonResults comparisonId="test-id" />
      </Wrapper>
    );

    // Verify completed state is shown
    await waitFor(() => {
      expect(screen.getByText(/94%/)).toBeInTheDocument();
      expect(screen.getByText(/Overall compliance is strong/)).toBeInTheDocument();
    });
  });

  it('should display ComplianceAnalysisResults page with clause breakdown', () => {
    const analysisData = {
      document: {
        name: 'Contract.pdf',
        type: 'Contract',
        size: '2.3 MB',
        uploaded: '2026-04-28',
      },
      overview: {
        compliance_score: 94,
        total_clauses: 3,
        issues_found: 0,
        compliant_clauses: 3,
        needs_review: 0,
        critical_issues: 0,
      },
      clauses: [
        {
          id: '1',
          name: 'Termination Clause',
          status: 'compliant' as const,
          confidence: 95,
          summary: 'Termination clause is fully compliant with requirements.',
        },
        {
          id: '2',
          name: 'Payment Terms',
          status: 'compliant' as const,
          confidence: 92,
          summary: 'Payment terms match the specified requirements.',
        },
        {
          id: '3',
          name: 'Liability Limitation',
          status: 'gap' as const,
          confidence: 85,
          summary: 'Liability limitations need minor adjustments.',
        },
      ],
    };

    render(
      <Wrapper>
        <ComplianceAnalysisResults data={analysisData} />
      </Wrapper>
    );

    // Should display compliance score
    expect(screen.getByText(/94%/)).toBeInTheDocument();
    // Should display clause names
    expect(screen.getByText('Termination Clause')).toBeInTheDocument();
    expect(screen.getByText('Payment Terms')).toBeInTheDocument();
    expect(screen.getByText('Liability Limitation')).toBeInTheDocument();
    // Should display confidence scores
    expect(screen.getByText('Confidence: 95%')).toBeInTheDocument();
    expect(screen.getByText('Confidence: 92%')).toBeInTheDocument();
    expect(screen.getByText('Confidence: 85%')).toBeInTheDocument();
  });

  it('should display severity counts in compliance score card', async () => {
    mockUseComparison.mockReturnValue(mockCompletedState);

    render(
      <Wrapper>
        <ComparisonResults comparisonId="test-id" />
      </Wrapper>
    );

    await waitFor(() => {
      // Should display critical, medium, low counts
      expect(screen.getByText('0')).toBeInTheDocument(); // critical_count
      expect(screen.getByText('1')).toBeInTheDocument(); // medium_count
      expect(screen.getByText('2')).toBeInTheDocument(); // low_count
    });
  });

  it('ProgressIndicator should display analysis in progress message', () => {
    mockUseComparison.mockReturnValue(mockProcessingState);

    const { container } = render(
      <Wrapper>
        <ComparisonResults comparisonId="test-id" />
      </Wrapper>
    );

    // Should show "Analysis in progress..." message
    expect(container.textContent).toContain('Analysis in progress');
  });

  it('should handle zero total chunks gracefully', () => {
    const zeroChunkState = {
      comparisonId: 'test-id',
      status: 'processing' as const,
      report: null,
      findings: [],
      isLoading: false,
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      currentChunk: 0,
      totalChunks: 0,
      estimatedCompletion: new Date(Date.now() + 600000).toISOString(),
    };

    mockUseComparison.mockReturnValue(zeroChunkState);

    const { container } = render(
      <Wrapper>
        <ComparisonResults comparisonId="test-id" />
      </Wrapper>
    );

    // Should display 0% without crashing - check for individual text nodes
    expect(container.textContent).toContain('0');
    expect(screen.getByText(/Chunk/)).toBeInTheDocument();
  });
});
