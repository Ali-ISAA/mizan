import { render, screen } from '@testing-library/react';
import { ComplianceAnalysisResults } from '@/pages/ComplianceAnalysisResults';
import { BrowserRouter } from 'react-router-dom';

describe('ComplianceAnalysisResults', () => {
  const mockData = {
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

  it('should display document overview with compliance score', () => {
    render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    expect(screen.getByText(/94%/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contract.pdf' })).toBeInTheDocument();
  });

  it('should display document name in header', () => {
    render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    const heading = screen.getByRole('heading', { name: 'Contract.pdf' });
    expect(heading).toBeInTheDocument();
  });

  it('should display clause names from data', () => {
    render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    expect(screen.getByText('Termination Clause')).toBeInTheDocument();
    expect(screen.getByText('Payment Terms')).toBeInTheDocument();
    expect(screen.getByText('Liability Limitation')).toBeInTheDocument();
  });

  it('should display compliance status badges for clauses', () => {
    render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    // Check that status badges are displayed (at least one of each type present)
    const compliantBadges = screen.getAllByText('compliant');
    const gapBadges = screen.getAllByText('gap');

    expect(compliantBadges.length).toBeGreaterThan(0);
    expect(gapBadges.length).toBeGreaterThan(0);
  });

  it('should display confidence scores for clauses', () => {
    render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    expect(screen.getByText('Confidence: 95%')).toBeInTheDocument();
    expect(screen.getByText('Confidence: 92%')).toBeInTheDocument();
    expect(screen.getByText('Confidence: 85%')).toBeInTheDocument();
  });

  it('should display total clauses count', () => {
    render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    expect(screen.getByText('Total Clauses')).toBeInTheDocument();
  });

  it('should display issues found count', () => {
    render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    expect(screen.getByText('Issues Found')).toBeInTheDocument();
  });

  it('should have back to documents button', () => {
    render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    const backButton = screen.getByText('Back to Documents');
    expect(backButton).toBeInTheDocument();
  });

  it('should have download report button', () => {
    render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    const downloadButton = screen.getByText('Download Report');
    expect(downloadButton).toBeInTheDocument();
  });

  it('should have ask AI assistant button', () => {
    render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    const aiButton = screen.getByText('Ask AI Assistant');
    expect(aiButton).toBeInTheDocument();
  });

  it('should display score emoji based on compliance score', () => {
    const { container } = render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    // Score 94 should show green emoji
    expect(container.textContent).toContain('🟢');
  });

  it('should display correct score color for high score', () => {
    const { container } = render(
      <BrowserRouter>
        <ComplianceAnalysisResults data={mockData} />
      </BrowserRouter>
    );

    const scoreElements = container.querySelectorAll('.text-success');
    expect(scoreElements.length).toBeGreaterThan(0);
  });
});
