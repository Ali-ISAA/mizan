import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue({
      data: [
        {
          id: '1',
          action: 'user_login',
          severity: 'info',
          title: 'User signed in',
          description: 'ali@example.com signed in',
          actor_email: 'ali@example.com',
          resource_type: null,
          resource_id: null,
          detail: {},
          created_at: new Date().toISOString(),
        },
      ],
    }),
  },
}));

import Activity from '../Activity';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

test('renders Activity page title', () => {
  render(<Activity />, { wrapper });
  expect(screen.getByText(/Activity Log/i)).toBeInTheDocument();
});

test('shows events from API', async () => {
  render(<Activity />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText('User signed in')).toBeInTheDocument();
  });
});
