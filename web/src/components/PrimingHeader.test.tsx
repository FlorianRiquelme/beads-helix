import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Snapshot, SnapshotIssue } from '@shared/snapshot-schema';
import { PrimingHeader } from './PrimingHeader';
import { withRouter } from '../test-utils';

const renderHeader = (snap: Snapshot) =>
  render(withRouter(<PrimingHeader snapshot={snap} projectId={snap.project_id} />));

const issue = (over: Partial<SnapshotIssue>): SnapshotIssue => ({
  id: 'beads-helix-x',
  title: 't',
  status: 'open',
  labels: [],
  priority: 2,
  issue_type: 'task',
  assignee: null,
  board_column: 'idea',
  summary_line: '',
  dependency_count: 0,
  dependent_count: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  closed_at: null,
  description: null,
  notes: null,
  design: null,
  dependency_ids: [],
  dependent_ids: [],
  ...over,
});

const baseSnapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  project_id: 'beads-helix',
  generated_at: '2026-04-14T00:00:00.000Z',
  stale_after: '2026-04-14T00:01:00.000Z',
  columns_summary: {
    idea: 5,
    refined: 3,
    ready: 2,
    in_progress: 1,
    done: 0,
    deferred: 0,
  },
  issues: [],
  _meta: { source: 'dolt_server', refresh_duration_ms: 5, schema_version: 1 },
  ...over,
});

describe('<PrimingHeader />', () => {
  it('renders the project name', async () => {
    renderHeader(baseSnapshot());
    expect(await screen.findByText('beads-helix')).toBeInTheDocument();
  });

  it('renders the per-stage counts on line 1', async () => {
    renderHeader(baseSnapshot());
    const counts = await screen.findByTestId('priming-counts');
    expect(counts).toHaveTextContent('5 idea');
    expect(counts).toHaveTextContent('3 refined');
    expect(counts).toHaveTextContent('2 ready');
  });

  it('renders the last-touched ticket id and title on line 2', async () => {
    const snap = baseSnapshot({
      issues: [
        issue({
          id: 'beads-helix-old',
          title: 'older',
          updated_at: '2026-04-01T00:00:00.000Z',
        }),
        issue({
          id: 'beads-helix-fresh',
          title: 'fresher',
          updated_at: '2026-04-13T00:00:00.000Z',
        }),
      ],
    });
    renderHeader(snap);
    const detail = await screen.findByTestId('priming-detail');
    expect(detail).toHaveTextContent(/last touched/i);
    expect(detail).toHaveTextContent('fresh');
    expect(detail).toHaveTextContent(/fresher/);
  });

  it('renders the in_progress claim when one exists', async () => {
    const snap = baseSnapshot({
      issues: [
        issue({
          id: 'beads-helix-now',
          title: 'live work',
          status: 'in_progress',
          board_column: 'in_progress',
        }),
      ],
    });
    renderHeader(snap);
    const detail = await screen.findByTestId('priming-detail');
    expect(detail).toHaveTextContent(/in progress/i);
    expect(detail).toHaveTextContent('now');
  });

  it('surfaces a "+N" badge when multiple issues are in progress', async () => {
    const snap = baseSnapshot({
      issues: [
        issue({
          id: 'beads-helix-now',
          title: 'primary in-flight',
          status: 'in_progress',
          board_column: 'in_progress',
        }),
        issue({
          id: 'beads-helix-two',
          title: 'secondary in-flight',
          status: 'in_progress',
          board_column: 'in_progress',
        }),
        issue({
          id: 'beads-helix-three',
          title: 'tertiary in-flight',
          status: 'in_progress',
          board_column: 'in_progress',
        }),
      ],
    });
    renderHeader(snap);
    const badge = await screen.findByLabelText(/2 more in progress/i);
    expect(badge).toHaveTextContent('+2');
  });

  it('does not render a "+N" badge when only one issue is in progress', async () => {
    const snap = baseSnapshot({
      issues: [
        issue({
          id: 'beads-helix-solo',
          title: 'solo',
          status: 'in_progress',
          board_column: 'in_progress',
        }),
      ],
    });
    renderHeader(snap);
    await screen.findByTestId('priming-detail');
    expect(screen.queryByLabelText(/more in progress/i)).not.toBeInTheDocument();
  });

  it('shows an idle marker when there are issues but none in progress', async () => {
    const snap = baseSnapshot({
      issues: [issue({ id: 'beads-helix-only', title: 'one', status: 'open' })],
    });
    renderHeader(snap);
    const detail = await screen.findByTestId('priming-detail');
    expect(detail).toHaveTextContent(/idle/i);
  });

  it('shows an empty marker when no issues touched yet', async () => {
    renderHeader(baseSnapshot({ issues: [] }));
    const detail = await screen.findByTestId('priming-detail');
    expect(detail).toHaveTextContent(/no issues yet/i);
  });
});
