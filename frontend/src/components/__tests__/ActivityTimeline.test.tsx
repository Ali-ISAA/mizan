import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue({
      data: [
        {
          id: '1',
          action: 'document_uploaded',
          severity: 'success',
          title: 'Document uploaded',
          description: 'test.pdf was uploaded',
          actor_email: 'ali@example.com',
          resource_type: 'document',
          resource_id: 'doc-1',
          detail: {},
          created_at: new Date().toISOString(),
        },
      ],
    }),
  },
}));

import { ActivityTimeline } from '../dashboard/activity-timeline';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

test('shows real activity events from API', async () => {
  render(<ActivityTimeline />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText('Document uploaded')).toBeInTheDocument();
  });
});

test('shows empty state when no events', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { api } = jest.requireMock('@/lib/api') as { api: { get: jest.Mock } };
  api.get.mockResolvedValueOnce({ data: [] });
  render(<ActivityTimeline />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
});
