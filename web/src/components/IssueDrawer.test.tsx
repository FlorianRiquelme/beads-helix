import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IssueDrawer } from './IssueDrawer';

const validIssue = {
  id: 'beads-helix-abc',
  title: 'The detail issue',
  status: 'open',
  labels: ['refined'],
  priority: 1,
  issue_type: 'task',
  assignee: null,
  board_column: 'refined',
  summary_line: '',
  dependency_count: 0,
  dependent_count: 0,
  created_at: '2026-04-14T00:00:00.000Z',
  updated_at: '2026-04-14T00:00:00.000Z',
  closed_at: null,
  description: null,
  notes: null,
  design: null,
  dependency_ids: [],
  dependent_ids: [],
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDrawer(props?: Partial<React.ComponentProps<typeof IssueDrawer>>) {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <IssueDrawer
        projectId="beads-helix"
        issueId="beads-helix-abc"
        open
        onClose={onClose}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...result, onClose, client };
}

describe('<IssueDrawer />', () => {
  it('renders a dialog when open', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => validIssue });
    renderDrawer();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('renders the issue title once loaded', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => validIssue });
    renderDrawer();
    expect(await screen.findByText('The detail issue')).toBeInTheDocument();
  });

  it('shows a loading state before data resolves', async () => {
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ ok: true, status: 200, json: async () => validIssue }),
            50,
          ),
        ),
    );
    renderDrawer();
    expect(screen.getByTestId('issue-drawer-loading')).toBeInTheDocument();
  });

  it('renders a 404 banner when the issue is not found', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'ISSUE_NOT_FOUND', message: 'no such issue' }),
    });
    renderDrawer();
    expect(await screen.findByTestId('issue-drawer-not-found')).toBeInTheDocument();
  });

  it('invokes onClose when the close (X) button is clicked', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => validIssue });
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await screen.findByText('The detail issue');
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('invokes onClose when Escape is pressed', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => validIssue });
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await screen.findByText('The detail issue');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('renders nothing (no dialog) when closed', () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => validIssue });
    renderDrawer({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses non-modal dialog so the board stays interactive', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => validIssue });
    renderDrawer();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).not.toBe('true');
  });
});
