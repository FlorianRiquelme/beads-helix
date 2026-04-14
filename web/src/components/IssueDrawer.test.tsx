import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Snapshot } from '@shared/snapshot-schema';
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

describe('<IssueDrawer /> Phase 4 — detail content', () => {
  it('renders description as markdown', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...validIssue,
        description: '# Hello\n\nSome **bold** text.',
      }),
    });
    renderDrawer();
    const heading = await screen.findByRole('heading', { name: 'Hello' });
    expect(heading).toBeInTheDocument();
    const bold = screen.getByText('bold');
    expect(bold.tagName).toBe('STRONG');
  });

  it('renders notes as markdown when present', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...validIssue,
        notes: 'Some *italic* note.',
      }),
    });
    renderDrawer();
    const italic = await screen.findByText('italic');
    expect(italic.tagName).toBe('EM');
  });

  it('does not render description section when null', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...validIssue, description: null }),
    });
    renderDrawer();
    await screen.findByText(validIssue.title);
    expect(screen.queryByTestId('issue-description')).not.toBeInTheDocument();
  });

  it('does not render notes section when null', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...validIssue, notes: null }),
    });
    renderDrawer();
    await screen.findByText(validIssue.title);
    expect(screen.queryByTestId('issue-notes')).not.toBeInTheDocument();
  });

  it('renders design inside a collapsed <details> element', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...validIssue,
        design: 'First line preview\n\nMore design content here.',
      }),
    });
    renderDrawer();
    const details = await screen.findByTestId('issue-design');
    expect(details.tagName).toBe('DETAILS');
    expect(details).not.toHaveAttribute('open');
    const summary = details.querySelector('summary');
    expect(summary?.textContent).toContain('First line preview');
  });

  it('does not render design section when null', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...validIssue, design: null }),
    });
    renderDrawer();
    await screen.findByText(validIssue.title);
    expect(screen.queryByTestId('issue-design')).not.toBeInTheDocument();
  });

  it('renders a "Copy bd update" button with the issue id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validIssue,
    });
    renderDrawer();
    const btn = await screen.findByRole('button', { name: /copy bd update/i });
    expect(btn).toBeInTheDocument();
  });

  it('copies "bd update <id>" command to clipboard when button is clicked', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validIssue,
    });
    const user = userEvent.setup();
    renderDrawer();
    const btn = await screen.findByRole('button', { name: /copy bd update/i });
    await user.click(btn);
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain('bd update beads-helix-abc');
  });

  it('sanitizes unsafe HTML in markdown (XSS protection)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...validIssue,
        description: 'Safe text <script>alert("xss")</script>',
      }),
    });
    renderDrawer();
    await screen.findByText(/Safe text/);
    expect(document.querySelector('script')).not.toBeInTheDocument();
  });

  it('renders GFM features like task lists and tables', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...validIssue,
        description: '- [x] done\n- [ ] todo',
      }),
    });
    renderDrawer();
    const checkboxes = await screen.findAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('renders metadata badges (priority, type, status, labels)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...validIssue,
        priority: 1,
        issue_type: 'task',
        status: 'open',
        labels: ['refined'],
      }),
    });
    renderDrawer();
    expect(await screen.findByText('P1')).toBeInTheDocument();
    expect(screen.getByText('task')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('refined')).toBeInTheDocument();
  });
});

const snapshotBase: Snapshot = {
  project_id: 'beads-helix',
  generated_at: '2026-04-14T00:00:00.000Z',
  stale_after: '2026-04-14T00:01:00.000Z',
  columns_summary: { idea: 1, refined: 1, ready: 0, in_progress: 0, done: 1, deferred: 0 },
  issues: [
    {
      ...validIssue,
      id: 'beads-helix-abc',
      title: 'The detail issue',
      dependency_ids: ['beads-helix-blocker', 'beads-helix-done-dep'],
      dependent_ids: ['beads-helix-child'],
    },
    {
      ...validIssue,
      id: 'beads-helix-blocker',
      title: 'Open blocker',
      status: 'open',
      board_column: 'idea',
    },
    {
      ...validIssue,
      id: 'beads-helix-done-dep',
      title: 'Closed dependency',
      status: 'closed',
      closed_at: '2026-04-13T00:00:00.000Z',
      notes: 'Research findings here',
      board_column: 'done' as string,
    },
    {
      ...validIssue,
      id: 'beads-helix-child',
      title: 'Downstream work',
      status: 'open',
      labels: ['refined'],
      board_column: 'refined',
    },
  ],
  _meta: { source: 'dolt_server', refresh_duration_ms: 5, schema_version: 2 },
};

function renderDrawerWithSnapshot(
  issueOverrides?: Partial<typeof validIssue>,
  snapshotOverrides?: Partial<Snapshot>,
) {
  const issue = { ...snapshotBase.issues[0], ...issueOverrides };
  const snapshot = { ...snapshotBase, ...snapshotOverrides };
  fetchMock.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.includes('/api/issue/')) {
      return { ok: true, status: 200, json: async () => issue };
    }
    if (typeof url === 'string' && url.includes('/api/snapshot')) {
      return { ok: true, status: 200, json: async () => snapshot };
    }
    return { ok: false, status: 404, json: async () => ({ error: 'NOT_FOUND' }) };
  });
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['snapshot', 'beads-helix'], snapshot);
  const result = render(
    <QueryClientProvider client={client}>
      <IssueDrawer projectId="beads-helix" issueId="beads-helix-abc" open onClose={onClose} />
    </QueryClientProvider>,
  );
  return { ...result, onClose, client };
}

describe('<IssueDrawer /> Phase 5 — Dependency Weather', () => {
  it('renders open blockers rail with blocker title', async () => {
    renderDrawerWithSnapshot();
    const rail = await screen.findByTestId('rail-open-blockers');
    expect(within(rail).getByText('Open blocker')).toBeInTheDocument();
  });

  it('renders closed deps rail with title and inline notes', async () => {
    renderDrawerWithSnapshot();
    const rail = await screen.findByTestId('rail-closed-deps');
    expect(within(rail).getByText('Closed dependency')).toBeInTheDocument();
    expect(within(rail).getByText(/Research findings here/)).toBeInTheDocument();
  });

  it('renders open dependents rail with maturity label', async () => {
    renderDrawerWithSnapshot();
    const rail = await screen.findByTestId('rail-open-dependents');
    expect(within(rail).getByText('Downstream work')).toBeInTheDocument();
    expect(within(rail).getByText('refined')).toBeInTheDocument();
  });

  it('does not render weather block when no deps or dependents', async () => {
    renderDrawerWithSnapshot({
      dependency_ids: [],
      dependent_ids: [],
    });
    await screen.findByText('The detail issue');
    expect(screen.queryByTestId('dependency-weather')).not.toBeInTheDocument();
  });
});

describe('<IssueDrawer /> Phase 6 — edge-state banners', () => {
  it('shows "hidden by filters" banner when issue is not in filtered set but exists in snapshot', async () => {
    const snapshot = { ...snapshotBase };
    const issue = snapshot.issues[0];
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/issue/')) {
        return { ok: true, status: 200, json: async () => issue };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const onClose = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['snapshot', 'beads-helix'], snapshot);
    render(
      <QueryClientProvider client={client}>
        <IssueDrawer
          projectId="beads-helix"
          issueId="beads-helix-abc"
          open
          onClose={onClose}
          filteredIssueIds={['beads-helix-other']}
          snapshotIssueIds={['beads-helix-abc', 'beads-helix-other']}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId('banner-filtered-out')).toBeInTheDocument();
  });

  it('shows "no longer present" banner when issue disappeared from snapshot', async () => {
    const issue = { ...validIssue };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => issue });
    const onClose = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <IssueDrawer
          projectId="beads-helix"
          issueId="beads-helix-abc"
          open
          onClose={onClose}
          snapshotIssueIds={['beads-helix-other']}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId('banner-disappeared')).toBeInTheDocument();
  });

  it('does not show banners when issue is present and not filtered', async () => {
    renderDrawerWithSnapshot();
    await screen.findByText('The detail issue');
    expect(screen.queryByTestId('banner-filtered-out')).not.toBeInTheDocument();
    expect(screen.queryByTestId('banner-disappeared')).not.toBeInTheDocument();
  });
});
